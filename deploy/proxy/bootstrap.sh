#!/usr/bin/env bash
# Прокси на Vercel для российских посетителей: nginx в Docker + сертификаты Let's Encrypt. Один файл, ничего скачивать не нужно.
# Запуск на сервере (Ubuntu/Debian, от root):
#   bash bootstrap.sh EMAIL домен1 [домен2 ...]
# Пример: bash bootstrap.sh me@example.com juicerai.ru
# Если в Vercel уже задан PROXY_SECRET, чтобы не менять его, передайте тот же секрет:
#   PROXY_SECRET=значение bash bootstrap.sh me@example.com juicerai.ru
# Домены должны уже указывать A-записью на IP этого сервера (иначе сертификат не выпустится). Порты 80 и 443 — свободны.
# Повторный запуск безопасен. Сам сайт и ключи сервис не видит: прокси лишь пересылает запросы на Vercel.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root."; exit 1; }
[ $# -ge 2 ] || { echo "Использование: bash bootstrap.sh EMAIL домен1 [домен2 ...]"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl python3 openssl iproute2 dnsutils cron
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2 || { curl -fsSL https://get.docker.com | sh; }
fi
systemctl enable --now docker cron >/dev/null 2>&1 || true

D=/opt/vercel-proxy
mkdir -p "$D/nginx" "$D/data"
cat > "$D/docker-compose.yml" <<'__BOOT_EOF__'
# Отдельный прокси на Vercel для новых сайтов (oporamap.ru, kontent...). Не затрагивает основной сайт и другие сервисы сервера.
# Запуск и сертификаты делает setup.sh. Нужны свободные порты 80 и 443.
services:
  nginx:
    image: nginx:1.27-alpine
    container_name: vercel-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./data/conf.d:/etc/nginx/conf.d:ro
      - ./data/proxy-common.inc:/etc/nginx/proxy-common.inc:ro
      - ./data/www:/var/www/certbot:ro
      - ./data/letsencrypt:/etc/letsencrypt:ro
    mem_limit: 256m   # транскрибация и другие сервисы на сервере не страдают
    cpus: 0.5
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
__BOOT_EOF__
cat > "$D/nginx/00-common.conf" <<'__BOOT_EOF__'
# Общие настройки http-уровня (файл попадает в conf.d)
resolver 127.0.0.11 1.1.1.1 valid=300s ipv6=off;
resolver_timeout 5s;
server_tokens off;
proxy_cache_path /var/cache/nginx/vercel levels=1:2 keys_zone=cache_zone:20m max_size=500m inactive=30d use_temp_path=off;
__BOOT_EOF__
cat > "$D/nginx/http.conf.tpl" <<'__BOOT_EOF__'
# Временный конфиг только для выпуска сертификата
server {
    listen 80;
    listen [::]:80;
    server_name __NAMES__;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { default_type text/plain; return 200 'ok'; }
}
__BOOT_EOF__
cat > "$D/nginx/https.conf.tpl" <<'__BOOT_EOF__'
# Прокси на Vercel для __DOMAIN__ (имена: __NAMES__)
server {
    listen 80;
    listen [::]:80;
    server_name __NAMES__;
    # проверка домена: свой файл certbot отдаём сами, остальное (проверка Vercel для выпуска его сертификата) пересылаем на Vercel по http
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; try_files $uri @vercel_http; }
    location @vercel_http {
        set $vercel_http cname.vercel-dns.com;
        proxy_pass http://$vercel_http;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name __NAMES__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    client_max_body_size 25m;
    set $vercel cname.vercel-dns.com;   # адрес Vercel определяется по DNS (не зашит), его IP могут меняться

    # Статика Next.js (имена файлов с хэшем): долгий кэш; при сбое Vercel отдаётся сохранённая копия
    location ^~ /_next/static/ {
        include /etc/nginx/proxy-common.inc;
        proxy_cache cache_zone;
        proxy_cache_key "$scheme$host$request_uri";
        proxy_cache_valid 200 30d;
        proxy_ignore_headers Set-Cookie;
        proxy_cache_use_stale error timeout http_403 http_502 http_503 updating;
        add_header X-Proxy-Cache $upstream_cache_status;
    }

    location / {
        include /etc/nginx/proxy-common.inc;
    }
}
__BOOT_EOF__
cat > "$D/nginx/proxy-common.inc" <<'__BOOT_EOF__'
# Общие директивы прокси на Vercel. __PROXY_SECRET__ подставляет setup.sh.
proxy_pass https://$vercel;
proxy_http_version 1.1;
proxy_set_header Connection "";

# Vercel выбирает проект по имени хоста: и Host, и SNI равны имени, под которым пришёл посетитель
proxy_ssl_server_name on;
proxy_ssl_name $host;
proxy_set_header Host $host;

# Vercel перезаписывает X-Forwarded-For, поэтому настоящий IP дублируем в свой заголовок с секретом
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Opora-Client-IP $remote_addr;
proxy_set_header X-Opora-Proxy-Secret "__PROXY_SECRET__";

proxy_connect_timeout 5s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
proxy_buffering on;
proxy_buffers 32 64k;
proxy_busy_buffers_size 256k;
__BOOT_EOF__
cat > "$D/setup.sh" <<'__BOOT_EOF__'
#!/usr/bin/env bash
# Прокси на Vercel в Docker для новых сайтов. Запуск (от root, из этой папки):
#   sudo bash setup.sh EMAIL домен1 [домен2 ...]
# Пример: sudo bash setup.sh me@example.com oporamap.ru kontent.единаясреда.рф
# Домены должны уже указывать (A-запись) на IP этого сервера. Порты 80 и 443 должны быть свободны.
# Повторный запуск безопасен: секрет и выпущенные сертификаты переиспользуются.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo)."; exit 1; }
[ $# -ge 2 ] || { echo "Использование: sudo bash setup.sh EMAIL домен1 [домен2 ...]"; exit 1; }
EMAIL="$1"; shift
DIR="$(cd "$(dirname "$0")" && pwd)"; DATA="$DIR/data"; cd "$DIR"

command -v docker >/dev/null || { echo "Docker не установлен."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нет плагина 'docker compose'."; exit 1; }
command -v python3 >/dev/null || { echo "Нужен python3 (для кириллических доменов)."; exit 1; }

to_ascii() { python3 -c 'import sys; print(sys.argv[1].strip().lower().encode("idna").decode())' "$1"; }

# Порты 80/443 должны быть свободны (или заняты нашим же контейнером)
for p in 80 443; do
  if ss -ltn "sport = :$p" | grep -q LISTEN && ! docker ps --format '{{.Names}}' | grep -qx vercel-proxy; then
    echo "Порт $p уже занят другим сервисом. Освободите его или выберите другую схему."; ss -ltnp "sport = :$p"; exit 1
  fi
done

mkdir -p "$DATA/conf.d" "$DATA/www" "$DATA/letsencrypt"
cp nginx/00-common.conf "$DATA/conf.d/00-common.conf"

# Общий секрет (его же нужно указать в Vercel как PROXY_SECRET); значение в чат и репозиторий не отправлять
umask 077
[ -s "$DATA/proxy.secret" ] || openssl rand -hex 32 > "$DATA/proxy.secret"
SECRET="$(tr -d '\n' < "$DATA/proxy.secret")"
sed "s|__PROXY_SECRET__|$SECRET|" nginx/proxy-common.inc > "$DATA/proxy-common.inc"
umask 022

MYIP="$(curl -s --max-time 8 https://api.ipify.org || true)"
DOMAINS=(); NAMES_OF=()
for raw in "$@"; do
  d="$(to_ascii "$raw")"
  names="$d"
  # www добавляем только к корневым доменам (из двух частей: oporamap.ru)
  [ "$(awk -F. '{print NF}' <<<"$d")" = 2 ] && names="$d www.$d"
  DOMAINS+=("$d"); NAMES_OF+=("$names")
  for n in $names; do
    got="$(getent ahostsv4 "$n" | awk '{print $1; exit}' || true)"
    [ -n "$MYIP" ] && [ "$got" != "$MYIP" ] && echo "ВНИМАНИЕ: $n указывает на '${got:-ничего}', а IP этого сервера $MYIP. Выпуск сертификата может не пройти."
  done
done

# 1) временные http-конфиги для выпуска сертификатов
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"
  if [ ! -d "$DATA/letsencrypt/live/$d" ]; then
    sed "s|__NAMES__|${NAMES_OF[$i]}|g" nginx/http.conf.tpl > "$DATA/conf.d/$d.conf"
  fi
done
docker compose up -d
sleep 2

# 2) сертификаты
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"; args=()
  for n in ${NAMES_OF[$i]}; do args+=(-d "$n"); done
  docker run --rm -v "$DATA/letsencrypt:/etc/letsencrypt" -v "$DATA/www:/var/www/certbot" certbot/certbot \
    certonly --webroot -w /var/www/certbot --cert-name "$d" "${args[@]}" \
    -m "$EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
done

# 3) боевые конфиги
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"
  sed -e "s|__NAMES__|${NAMES_OF[$i]}|g" -e "s|__DOMAIN__|$d|g" nginx/https.conf.tpl > "$DATA/conf.d/$d.conf"
done
if docker compose exec -T nginx nginx -t; then
  docker compose exec -T nginx nginx -s reload
else
  echo "Ошибка в конфиге nginx, перезагрузка не выполнена."; exit 1
fi

# 4) автопродление сертификатов
cat > /etc/cron.d/vercel-proxy-renew <<CRON
17 3 * * * root docker run --rm -v $DATA/letsencrypt:/etc/letsencrypt -v $DATA/www:/var/www/certbot certbot/certbot renew -q && docker exec vercel-proxy nginx -s reload
CRON

echo
echo "Готово. Домены: ${DOMAINS[*]}"
echo "PROXY_SECRET лежит в файле: $DATA/proxy.secret (скопируйте значение в Vercel, проект «Опора», и сделайте Redeploy):"
echo "  cat $DATA/proxy.secret"
echo "Проверка: curl -sI https://${DOMAINS[0]}/ | head -3"
__BOOT_EOF__
chmod +x "$D/setup.sh"
# заранее заданный секрет (тот же, что в Vercel) кладём в файл, который читает setup.sh
if [ -n "${PROXY_SECRET:-}" ] && [ ! -s "$D/data/proxy.secret" ]; then
  umask 077; printf '%s' "$PROXY_SECRET" > "$D/data/proxy.secret"; umask 022
fi
cd "$D"
bash ./setup.sh "$@"
