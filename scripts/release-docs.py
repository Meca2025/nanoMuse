#!/usr/bin/env python3
"""The release-day edits to the pages that name the current version.

    scripts/release-docs.py <old> <new> <old-codename> <new-codename> <date>
    scripts/release-docs.py 0.1.40 0.1.41 Clear Still 2026-10-20

- ``CHANGELOG.md``: a ``## [<new>] - <date> · <Codename>`` heading goes right under
  ``## [Unreleased]`` so the Unreleased bullets fall under it; the empty ``### Cloud / Runtime /
  …`` headings for the next version are put back by hand (see the previous release commit).
- ``README.md``, ``docs/readme/README_*.md``, ``docs/index.md``, ``docs/zh/index.md``: ``<old> <OldName>`` becomes
  ``<new> <NewName>``, every ``v<old>`` tag and ``nanoMuse-<old>`` asset name moves to the new
  version; News lines (``- `<date>` ...``) are left alone, they name the milestones and the
  version they were written for on purpose. The *News* lists themselves (the README family and
  the homepage's ``index.html``) are edited by hand: the line that names the latest version is
  replaced by the new one; the paper, the first release and the other milestones stay.
- ``docs/release-notes-template.md``: the new codename joins the list.
- ``docs/roadmap.md`` (the past-releases table) and ``docs/parity.md`` (cells that said "next
  release") are edited by hand.

Run from the repository root. ``scripts/release-bump.sh`` comes before this, ``scripts/rebrand.py``
in between; CONTRIBUTING.md has the whole recipe.
"""

from __future__ import annotations

import glob
import re
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    old, new, oldname, newname, date = argv
    if not Path("pyproject.toml").is_file():
        print("run from the repository root", file=sys.stderr)
        return 2

    changelog = Path("CHANGELOG.md")
    s = changelog.read_text(encoding="utf-8")
    marker = "## [Unreleased]\n\n"
    if marker not in s or f"## [{new}]" in s:
        print(
            "CHANGELOG.md: no empty Unreleased marker, or the version is already there",
            file=sys.stderr,
        )
        return 1
    changelog.write_text(
        s.replace(marker, f"{marker}## [{new}] - {date} · {newname}\n\n", 1), encoding="utf-8"
    )

    # A News line (`- `2026-10-06` 🚀 Latest version: [0.1.40 Clear](…/tag/v0.1.40).`) names the
    # version it was written for on purpose and keeps its tag; every other line moves to the new
    # version.
    news_line = re.compile(r"^- `\d{4}-\d{2}-\d{2}` ")
    pages = [
        "README.md",
        "docs/index.md",
        "docs/zh/index.md",
        *sorted(glob.glob("docs/readme/README_*.md")),
    ]
    for name in pages:
        p = Path(name)
        out: list[str] = []
        for line in p.read_text(encoding="utf-8").split("\n"):
            if not news_line.match(line):
                line = line.replace(f"{old} {oldname}", f"{new} {newname}")
                line = line.replace(f"v{old}", f"v{new}").replace(
                    f"nanoMuse-{old}", f"nanoMuse-{new}"
                )
                line = re.sub(rf"(?<![\d.]){re.escape(old)}-", f"{new}-", line)
            out.append(line)
        p.write_text("\n".join(out), encoding="utf-8")
        left = sum(1 for line in out if old in line and not news_line.match(line))
        print(f"{name}: {left} line(s) still naming {old} outside the News list")

    template = Path("docs/release-notes-template.md")
    s = template.read_text(encoding="utf-8")
    if f", {oldname} (CHANGELOG" not in s:
        print(
            "docs/release-notes-template.md: the codename list does not end with the previous name",
            file=sys.stderr,
        )
        return 1
    template.write_text(
        s.replace(f", {oldname} (CHANGELOG", f", {oldname}, {newname} (CHANGELOG"), encoding="utf-8"
    )
    print(
        "by hand now: the News lines (README.md, docs/readme/*, the homepage), docs/roadmap.md's "
        "past-releases row, docs/parity.md, the empty Unreleased headings in CHANGELOG.md"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
