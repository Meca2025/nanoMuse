"""The tests never reach the network: the GitHub collector's background task stays off
unless a test turns it on with a mocked transport (`Settings(github_collect=True)`)."""

from __future__ import annotations

import os

import pytest

os.environ["GITHUB_COLLECT"] = "0"

# A charge is priced at the hour it is made (DeepSeek's idle hours are half price): the
# suite prices every charge at this busy-hour moment unless a test moves the clock itself.
BUSY_HOUR = 1791439200  # 2026-10-08T06:00:00Z = 14:00 Beijing time


@pytest.fixture(autouse=True)
def _busy_hour_clock(monkeypatch):
    from nanomuse_cloud.service import Cloud

    monkeypatch.setattr(Cloud, "clock", staticmethod(lambda: BUSY_HOUR))
