"""`python -m nanomuse_cloud [--host H] [--port P]` — run the relay with uvicorn."""

from __future__ import annotations

import argparse
import logging

import uvicorn

from .api import create_app
from .config import Settings


def main() -> None:
    ap = argparse.ArgumentParser(prog="nanomuse_cloud", description="nanoMuse Cloud relay")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--log-level", default="info")
    args = ap.parse_args()
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs every upstream URL at INFO; the relay's own line per request is enough.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = Settings()
    app = create_app(settings)
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level, proxy_headers=True, forwarded_allow_ips="*")


if __name__ == "__main__":
    main()
