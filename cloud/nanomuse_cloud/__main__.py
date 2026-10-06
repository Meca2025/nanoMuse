"""`python -m nanomuse_cloud [--host H] [--port P]` — run the relay with uvicorn.

0.22: `nanomuse-cloud admin controls list|set <switch> on|off` talks to a running relay's
admin API (so its in-memory switches change at once), with `--base` / `--token` or
PUBLIC_BASE / CLOUD_ADMIN_TOKEN from the environment (`cloud/.env` is read).
"""

from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import sys

import httpx
import uvicorn

from .api import create_app
from .config import Settings
from .controls import SWITCHES


def _serve(args: argparse.Namespace) -> None:
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs every upstream URL at INFO; the relay's own line per request is enough.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = Settings()
    if settings.dev_mode and settings.sender != "log":
        # identifiers would be hashed with a public fixed key while real codes go out
        raise SystemExit("CLOUD_SECRET is not set; a relay that sends codes (CODE_SENDER != log) must have one")
    app = create_app(settings)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        proxy_headers=True,
        forwarded_allow_ips="*",
        ws_max_size=settings.hub_frame_limit,
        ws_ping_interval=25.0,
        ws_ping_timeout=60.0,
    )


def _admin_client(args: argparse.Namespace) -> httpx.Client:
    settings = Settings()
    base = (args.base or os.environ.get("NANOMUSE_CLOUD_BASE") or settings.public_base or "http://127.0.0.1:8787").rstrip("/")
    token = args.token or os.environ.get("CLOUD_ADMIN_TOKEN") or settings.admin_token
    if not token:
        raise SystemExit("no admin token: pass --token or set CLOUD_ADMIN_TOKEN")
    actor = args.actor or f"cli:{getpass.getuser()}"
    return httpx.Client(base_url=base, headers={"X-Admin-Token": token, "X-Admin-Actor": actor[:80]}, timeout=20.0)


def _say(obj: object) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def _controls(args: argparse.Namespace) -> None:
    with _admin_client(args) as c:
        if args.what == "list":
            r = c.get("/v1/admin/controls")
            r.raise_for_status()
            view = r.json()
            for key, st in view["switches"].items():
                print(f"{key:15s} {'on ' if st['enabled'] else 'OFF'}  {st.get('actor') or ''}  {st.get('note') or ''}".rstrip())
            print(f"accounts: {view['accounts_total']}  rules: {len(view['rules'])}  notify configured: {view['notify_configured']}")
            return
        if args.what == "set":
            body = {"enabled": args.state == "on", "note": args.note or ""}
            r = c.post(f"/v1/admin/controls/{args.switch}", json=body)
            if r.status_code >= 400:
                raise SystemExit(f"{r.status_code}: {r.text}")
            _say(r.json())
            return
        if args.what == "audit":
            r = c.get("/v1/admin/controls/audit", params={"limit": args.limit})
            r.raise_for_status()
            for row in r.json()["audit"]:
                print(f"{row['ts']}  {row['actor']:18s} {row['action']:12s} {row['target']:16s} {row['detail']}")
            return
    raise SystemExit(2)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="nanomuse-cloud", description="nanoMuse Cloud relay")
    sub = ap.add_subparsers(dest="cmd")
    serve = sub.add_parser("serve", help="run the relay (the default)")
    for p in (ap, serve):
        p.add_argument("--host", default="0.0.0.0")
        p.add_argument("--port", type=int, default=8787)
        p.add_argument("--log-level", default="info")
    admin = sub.add_parser("admin", help="talk to a running relay's admin API")
    admin.add_argument("--base", help="the relay's URL (default: PUBLIC_BASE or http://127.0.0.1:8787)")
    admin.add_argument("--token", help="the admin token (default: CLOUD_ADMIN_TOKEN)")
    admin.add_argument("--actor", help="who is doing this, for the audit log (default: cli:<user>)")
    asub = admin.add_subparsers(dest="area")
    controls = asub.add_parser("controls", help="the switches and their audit log")
    csub = controls.add_subparsers(dest="what")
    csub.add_parser("list", help="every switch and its state")
    s = csub.add_parser("set", help="flip one switch")
    s.add_argument("switch", choices=SWITCHES)
    s.add_argument("state", choices=("on", "off"))
    s.add_argument("--note", help="why, for the audit log")
    a = csub.add_parser("audit", help="the last audit lines")
    a.add_argument("--limit", type=int, default=50)
    args = ap.parse_args(argv)
    if args.cmd == "admin":
        if args.area == "controls" and args.what:
            _controls(args)
            return
        admin.print_help()
        sys.exit(2)
    _serve(args)


if __name__ == "__main__":
    main()
