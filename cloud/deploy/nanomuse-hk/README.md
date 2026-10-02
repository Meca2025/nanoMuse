# nanoMuse Cloud on nanomuse-hk

The production relay behind `https://cloud.nanomuse.cn` runs on the same Hong
Kong box as the project site, behind the showcase's Caddy
(`demo/showcase`). This directory is everything specific to that box; the
relay itself is [`cloud/`](../../README.md).

| | |
|---|---|
| host | `nanomuse-hk` (SSH alias), Ubuntu 24.04, Docker |
| relay | `/opt/nanomuse/relay/` — `docker-compose.yml`, `.env`, `src/`, `data/cloud.db` |
| container | `nanomuse-relay`, on the `showcase_edge` network, no published ports |
| TLS / vhost | `demo/showcase/sites.d/cloud.nanomuse.cn.caddy` → `nanomuse-relay:8787` |
| backups | `/opt/nanomuse/backups/cloud-*.db.gz`, daily 04:10 UTC, 30 days (`backup.sh`, systemd timer) |
| admin | `https://cloud.nanomuse.cn/app/admin/`, token in `/opt/nanomuse/relay/ADMIN_TOKEN.txt` (0600) |
| DNS | DNSPod: `cloud` A → the box's address, same as the apex |

## First time

On the box, once, as the deploying user:

```bash
sudo mkdir -p /opt/nanomuse/relay && sudo chown "$USER" /opt/nanomuse/relay
cd /opt/nanomuse/relay
umask 077
cat > .env <<EOF
PUBLIC_BASE=https://cloud.nanomuse.cn
CLOUD_SECRET=$(openssl rand -hex 32)
CLOUD_ADMIN_TOKEN=$(openssl rand -hex 32)
# anyone may sign in; the members below (comma-separated phone numbers /
# e-mail addresses) have no limit, everyone else ¥10 for good, +¥5 an
# invite (to both sides)
SIGNUP_OPEN=1
ALLOWED_IDENTIFIERS=
ALLOWANCE_CNY=10
INVITE_BONUS_CNY=5
OWN_KEY_DOCS=https://nanomuse.cn/own-key
# what "Help improve nanoMuse's AI models" starts as for new accounts (1 = on
# until turned off under Settings → Data controls); say it in PRIVACY_URL
IMPROVE_DEFAULT=1
PRIVACY_URL=https://nanomuse.cn/privacy/
DAY_OFFSET_H=8
USD_CNY=7.1
# no token ceiling; usage is metered and shown
SIGNUP_TOKENS=0
DAILY_CAP_TOKENS=0
PER_MINUTE_REQUESTS=30
# codes: log until DirectMail is set up, then smtp
CODE_SENDER=log
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_USER=no-reply@mail.nanomuse.cn
SMTP_PASSWORD=
SMTP_FROM=nanoMuse <no-reply@mail.nanomuse.cn>
# the 百炼 key the relay spends (public endpoints; never a private one)
UPSTREAM_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_BASE=https://dashscope.aliyuncs.com/api/v1
UPSTREAM_KEY=
EOF
sed -n 's/^CLOUD_ADMIN_TOKEN=//p' .env > ADMIN_TOKEN.txt
```

Fill `ALLOWED_IDENTIFIERS` and `UPSTREAM_KEY` with an editor on the box (not
over a chat, not in a shell history: `nano .env`). Then, from a checkout on
a machine with the SSH alias:

```bash
cloud/deploy/nanomuse-hk/deploy.sh
```

which syncs `cloud/`, installs the compose file, the backup timer and the
Caddy site, builds and starts the container, and checks `/healthz` inside
the container and through the public name. The public check fails until the
`cloud` A record has spread and Caddy has fetched the certificate (a minute
after the record resolves).

## Every later deploy

```bash
cloud/deploy/nanomuse-hk/deploy.sh
```

The database and `.env` are never touched. A change to `.env` needs
`docker compose up -d` (or `deploy.sh`) to take effect.

## Day to day

```bash
ssh nanomuse-hk docker logs -f --since 10m nanomuse-relay      # codes when CODE_SENDER=log, errors
ssh nanomuse-hk 'cd /opt/nanomuse/relay && docker compose ps'
ssh nanomuse-hk /opt/nanomuse/relay/backup.sh                     # a backup right now
scp nanomuse-hk:/opt/nanomuse/backups/cloud-*.db.gz ~/backups/   # take a copy off the box monthly
```

Sign-up is open; everyone gets ¥10 for the account's lifetime and +¥5 per
person they invite (the person invited gets +¥5 too). Giving
someone more: *加额度* on the admin page (into their pool), or press *设为成员*
next to their account on the admin page (no restart), or add the number or
address to `ALLOWED_IDENTIFIERS` in `.env` and `docker compose up -d`.
Removing someone: disable or delete the account on the admin page. Closing
the door again: `SIGNUP_OPEN=0` (members only) and `docker compose up -d`.

Kill switch — the relay stops answering, nothing else on the box changes:

```bash
ssh nanomuse-hk 'cd /opt/nanomuse/relay && docker compose stop'
```

and `docker compose start` brings it back. To cut only the spending, blank
`UPSTREAM_KEY` and `up -d`: sign-in and the hub keep working, the models
answer 503.

## Restoring

```bash
ssh nanomuse-hk 'cd /opt/nanomuse/relay && docker compose stop \
  && gunzip -c /opt/nanomuse/backups/cloud-YYYYMMDD-HHMMSS.db.gz > data/cloud.db \
  && rm -f data/cloud.db-wal data/cloud.db-shm && docker compose start'
```

A backup is only readable with the `CLOUD_SECRET` it was written under;
`backup.sh` keeps a copy of `.env` next to the database copies for that
reason (`env.latest`, 0600).
