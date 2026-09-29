#!/usr/bin/env python3
"""Build the runtime the desktop app carries: a one-folder PyInstaller build of `nanomuse`
(serve, chat, the hub, this computer's hands) at desktop/app/runtime/, where electron-builder
picks it up as an extra resource.

    python scripts/desktop-app/build-runtime.py            # from a venv with .[hands] and pyinstaller
    python scripts/desktop-app/build-runtime.py --check    # then start it once and ask /api/health

Needs: the repository's Python environment with `pip install -e ".[hands]" pyinstaller`.
The web app must already be built into nanomuse/server/static (it is committed).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "scripts" / "desktop-app" / "nanomuse_runtime.spec"
WORK = ROOT / "build" / "runtime-pyi"
DIST = ROOT / "build" / "runtime-dist"
TARGET = ROOT / "desktop" / "app" / "runtime"


def run(*cmd: str, **kw) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def build() -> Path:
    shutil.rmtree(DIST, ignore_errors=True)
    run(
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--distpath",
        str(DIST),
        "--workpath",
        str(WORK),
        str(SPEC),
        cwd=str(ROOT),
    )
    built = DIST / "nanomuse"
    exe = built / ("nanomuse.exe" if sys.platform == "win32" else "nanomuse")
    if not exe.exists():
        raise SystemExit(f"PyInstaller produced nothing at {exe}")
    shutil.rmtree(TARGET, ignore_errors=True)
    shutil.copytree(built, TARGET)
    size = sum(p.stat().st_size for p in TARGET.rglob("*") if p.is_file()) // (1024 * 1024)
    print(f"runtime: {TARGET} ({size} MB)")
    return TARGET / exe.name


def check(exe: Path) -> None:
    """Start the bundled runtime once, wait for /api/health, stop it."""
    port = 8765
    home = ROOT / "build" / "runtime-check-home"
    shutil.rmtree(home, ignore_errors=True)
    env = dict(os.environ, NANOMUSE_DATA_DIR=str(home), NANOMUSE_WORKSPACE=str(home / "ws"))
    for key in ("OPENAI_API_KEY", "DASHSCOPE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_BASE_URL"):
        env.pop(key, None)
    proc = subprocess.Popen(
        [str(exe), "serve", "--no-qr", "--no-auth", "--port", str(port)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as r:
                    body = json.loads(r.read())
                    if body.get("ok"):
                        print("health:", body)
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as r2:
                            page = r2.read()
                            assert (
                                b'<div id="root"' in page
                                or b"<div id=root" in page
                                or len(page) > 200
                            )
                        print("the app is served; the bundled runtime works")
                        return
            except Exception:  # noqa: BLE001
                if proc.poll() is not None:
                    break
                time.sleep(0.5)
        out = proc.stdout.read() if proc.stdout else ""
        raise SystemExit(f"the bundled runtime did not come up:\n{out[-4000:]}")
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(home, ignore_errors=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="start it once and ask /api/health")
    ap.add_argument(
        "--check-only", action="store_true", help="only check the runtime already built"
    )
    args = ap.parse_args()
    if args.check_only:
        exe = TARGET / ("nanomuse.exe" if sys.platform == "win32" else "nanomuse")
    else:
        exe = build()
    if args.check or args.check_only:
        check(exe)


if __name__ == "__main__":
    main()
