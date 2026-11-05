# Juicer on Timeweb

Production: 94.198.217.44. Docker containers `juicer-web-blue/green` use the isolated
`juicer-runtime` network, 2 GiB RAM and 1 CPU each. Builds run on GitHub Actions.
Only the active release stays running after a successful switch.

`/opt/juicer/runtime.env` contains production credentials (root, mode 600).
Preserve AUTH_SECRET and CHANNEL_SECRET: existing sessions and encrypted channel tokens depend on them.
Never commit runtime credentials. Only NEXT_PUBLIC_* browser configuration is passed to image builds.

GitHub secrets: TIMEWEB_DEPLOY_KEY (restricted forced command), TIMEWEB_KNOWN_HOSTS,
TIMEWEB_PUBLIC_ENV. Variables: TIMEWEB_HOST, TIMEWEB_DEPLOY_ENABLED.
The main branch deploys automatically when enabled. Pull requests only build and check.

The forced command `/usr/local/sbin/juicer-deploy` accepts `deploy <SHA>` plus a
gzipped Docker image, or `rollback <SHA>` for a retained image. It checks app/DB
readiness, switches only the Juicer upstream, and restores routing on failure.
State is under `/opt/juicer`; other projects and Docker images are not pruned.

The production worker must have exactly one scheduler. Its advisory DB lock
prevents overlapping runs. Avoid running a trial worker against production:
it generates billable content and can publish posts.
