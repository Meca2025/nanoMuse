"""The relay's conversation-sync API (``/v1/sync/*``, relay 0.19, contract C7), as the
runtime calls it. Thin: every method is one request with the account's key; errors come
back as :class:`nanomuse.cloud.CloudError` (``sync_off`` when the person turned it off on
another device, ``bad_key`` when the sign-in ended)."""

from __future__ import annotations

from typing import Any

from nanomuse.cloud import CloudClient

DEFAULT_PAGE = 500


class SyncClient:
    def __init__(self, cloud: CloudClient):
        self.cloud = cloud

    async def state(self) -> dict[str, Any]:
        """``{enabled, cursor, counts{conversations, messages}, limits{messages, text_bytes}}``."""
        return await self.cloud._request("GET", "/v1/sync/state")

    async def set_enabled(self, enabled: bool) -> dict[str, Any]:
        """Off deletes everything the relay stores for the account; on starts empty."""
        return await self.cloud._request("PUT", "/v1/sync/state", {"enabled": bool(enabled)})

    async def changes(self, since: int = 0, limit: int = DEFAULT_PAGE) -> dict[str, Any]:
        """Everything after ``since`` in seq order: ``{cursor, more, conversations[], messages[]}``."""
        return await self.cloud._request(
            "GET", f"/v1/sync/changes?since={int(since)}&limit={int(limit)}"
        )

    async def push(
        self, device: str, conversations: list[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """``{cursor, accepted, rejected[{cid|mid, reason, cid_main?}]}``; at most 200 messages."""
        return await self.cloud._request(
            "POST",
            "/v1/sync/changes",
            {"device": device, "conversations": conversations, "messages": messages},
        )

    async def delete_conversation(self, cid: str) -> dict[str, Any]:
        """Tombstone one chat for every device; the relay drops its texts at once."""
        return await self.cloud._request("DELETE", f"/v1/sync/conversations/{cid}")

    async def wipe(self) -> dict[str, Any]:
        """Empty the account's store; the switch stays where it is."""
        return await self.cloud._request("DELETE", "/v1/sync/changes")
