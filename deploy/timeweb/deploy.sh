#!/usr/bin/env bash
# Root-owned forced SSH command. Accepts a Docker image stream, never a shell.
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077
BASE=/opt/juicer
NETWORK=juicer-runtime
PROXY=vercel-proxy
UPSTREAM=/root/docker-proxy/data/conf.d/00-juicer-upstream.conf
COMMAND=${SSH_ORIGINAL_COMMAND:-${1:-}}
if [[ ! "$COMMAND" =~ ^(deploy|rollback)\ ([0-9a-f]{40})$ ]]; then
  echo 'Expected: deploy <40-character commit SHA> or rollback <SHA>' >&2
  exit 2
fi
OP=${BASH_REMATCH[1]}
SHA=${BASH_REMATCH[2]}
IMAGE=juicer:$SHA
exec 9>"$BASE/deploy.lock"
flock -w 1200 9
[[ -s "$BASE/runtime.env" ]] || { echo 'Missing runtime.env; deployment not activated.' >&2; exit 1; }
[[ -f "$BASE/activated" ]] || { echo 'Migration not activated; leaving existing sites unchanged.' >&2; exit 1; }
AVAILABLE=$(df -Pk "$BASE" | awk 'NR==2 {print $4}')
(( AVAILABLE > 5 * 1024 * 1024 )) || { echo 'Less than 5 GiB of free disk.' >&2; exit 1; }

if [[ "$OP" == deploy ]]; then
  gzip -dc | docker load > /dev/null
fi
REVISION=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")
[[ "$REVISION" == "$SHA" ]] || { echo 'Image revision mismatch.' >&2; exit 1; }

OLD_SLOT=$(cat "$BASE/active-slot" 2>/dev/null || true)
SLOT=blue
[[ "$OLD_SLOT" != blue ]] || SLOT=green
NAME=juicer-web-$SLOT
OLD_CONFIG="$BASE/upstream.before"
HAD_CONFIG=0
if [[ -f "$UPSTREAM" ]]; then
  cp "$UPSTREAM" "$OLD_CONFIG"
  HAD_CONFIG=1
fi
SWITCHED=0
COMMITTED=0
cleanup() {
  code=$?
  trap - EXIT INT TERM
  if (( COMMITTED == 0 )); then
    if (( SWITCHED == 1 )); then
      if (( HAD_CONFIG == 1 )); then
        cp "$OLD_CONFIG" "$UPSTREAM"
      else
        rm -f "$UPSTREAM"
      fi
      if ! { docker exec "$PROXY" nginx -t && docker exec "$PROXY" nginx -s reload; }; then
        echo 'URGENT: proxy rollback requires inspection; candidate kept alive.' >&2
        exit 1
      fi
    fi
    docker rm -f "$NAME" > /dev/null 2>&1 || true
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The other slot keeps serving while this candidate starts.
docker rm -f "$NAME" > /dev/null 2>&1 || true
docker run -d --name "$NAME" --network "$NETWORK" \
  --restart unless-stopped --init --memory 2g --memory-swap 2g --cpus 1 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --log-driver json-file --log-opt max-size=20m --log-opt max-file=3 \
  --env-file "$BASE/runtime.env" -e RELEASE_SHA="$SHA" \
  "$IMAGE" > /dev/null

check() {
  local target=$1
  local endpoint=${2:-http://$NAME:3000/api/deploy/health}
  docker exec "$target" node -e '
    const http=require("node:http");
    const req=http.get(process.argv[1],{family:4,headers:{connection:"close"}},r=>{let b="";r.on("data",x=>b+=x);r.on("end",()=>{
      try {const d=JSON.parse(b);const ok=r.statusCode===200&&d.ok===true&&d.revision===process.argv[2];
        if(!ok) console.error("Readiness response:",r.statusCode,"revision:",d.revision||"none");process.exit(ok?0:1)}
      catch {console.error("Readiness response is not JSON");process.exit(1)}
    })});
    const deadline=setTimeout(()=>{console.error("Readiness deadline exceeded");req.destroy();process.exit(1)},10000);
    req.on("error",e=>{clearTimeout(deadline);console.error("Readiness connection:",e.code||e.name);process.exit(1)});
  ' "$endpoint" "$SHA"
}
READY=0
for (( attempt=1; attempt<=18; attempt++ )); do
  if check "$NAME"; then READY=1; break; fi
  sleep 5
done
(( READY == 1 )) || { echo 'Candidate failed application/DB readiness; old version stays active.' >&2; exit 1; }

printf 'upstream juicer_web {\n    server %s:3000;\n    keepalive 32;\n}\nserver {\n    listen 8098;\n    server_name _;\n    location = /api/deploy/health {\n        proxy_pass http://juicer_web;\n        proxy_set_header Host juicerai.ru;\n    }\n    location / { return 404; }\n}\n' "$NAME" > "$UPSTREAM.new"
chmod 644 "$UPSTREAM.new"
mv "$UPSTREAM.new" "$UPSTREAM"
SWITCHED=1
docker exec "$PROXY" nginx -t
docker exec "$PROXY" nginx -s reload
# Nginx reload is asynchronous. Allow DNS/worker transition, but require two
# consecutive successful probes through nginx before committing release state.
PROXY_READY=0
for (( attempt=1; attempt<=12; attempt++ )); do
  sleep 2
  if check "$NAME" 'http://juicer-proxy:8098/api/deploy/health'; then
    PROXY_READY=$((PROXY_READY + 1))
    if (( PROXY_READY >= 2 )); then break; fi
  else
    PROXY_READY=0
  fi
done
(( PROXY_READY >= 2 )) || { echo 'Proxy readiness failed; restoring previous release.' >&2; exit 1; }
if [[ -s "$BASE/active-sha" ]]; then cp "$BASE/active-sha" "$BASE/previous-sha"; fi
printf '%s\n' "$SHA" > "$BASE/active-sha.new"
printf '%s\n' "$SLOT" > "$BASE/active-slot.new"
mv "$BASE/active-sha.new" "$BASE/active-sha"
mv "$BASE/active-slot.new" "$BASE/active-slot"
COMMITTED=1
echo "Ready: $NAME commit=$SHA"
if [[ -n "$OLD_SLOT" && "$OLD_SLOT" != "$SLOT" ]]; then
  docker stop --time 300 "juicer-web-$OLD_SLOT" > /dev/null || true
fi
# Keep the active release, rollback release and one extra image. Never prune
# Docker globally: PDF, speech and the other site's proxy share this VPS.
PREVIOUS_SHA=$(cat "$BASE/previous-sha" 2>/dev/null || true)
EXTRA_KEPT=0
while IFS= read -r image_sha; do
  [[ "$image_sha" =~ ^[0-9a-f]{40}$ ]] || continue
  [[ "$image_sha" != "$SHA" && "$image_sha" != "$PREVIOUS_SHA" ]] || continue
  if (( EXTRA_KEPT == 0 )); then
    EXTRA_KEPT=1
  else
    docker image rm "juicer:$image_sha" > /dev/null 2>&1 || true
  fi
done < <(docker image ls juicer --format '{{.Tag}}')
