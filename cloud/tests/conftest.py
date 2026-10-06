"""The tests never reach the network: the GitHub collector's background task stays off
unless a test turns it on with a mocked transport (`Settings(github_collect=True)`)."""

from __future__ import annotations

import os

os.environ["GITHUB_COLLECT"] = "0"
