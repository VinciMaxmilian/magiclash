"""In-memory stand-in for SupabaseGateway (unit tests; the real thing has integration tests)."""

from __future__ import annotations

import copy
from typing import Any

from app.repositories.supabase import SupabaseError


class FakeSupabase:
    def __init__(self) -> None:
        self.tokens: dict[str, dict[str, Any]] = {}
        self.tables: dict[str, list[dict[str, Any]]] = {
            "profiles": [],
            "profiles_private": [],
            "player_stats": [],
            "player_ratings": [],
        }
        self.storage: dict[str, bytes] = {}
        self.auth_calls = 0

    def add_user(self, uid: str, username: str, token: str, email: str = "x@example.com") -> None:
        self.tokens[token] = {"id": uid, "email": email}
        self.tables["profiles"].append(
            {"id": uid, "username": username, "avatar_id": "knight", "avatar_path": None,
             "favorite_character": "knight", "created_at": "2026-09-23T00:00:00Z"}
        )
        self.tables["profiles_private"].append({"user_id": uid, "settings": {"volume": 0.5}})
        self.tables["player_stats"].append(
            {"user_id": uid, "matches": 3, "wins": 2, "losses": 1, "kos": 5, "deaths": 2, "damage_dealt": 300}
        )
        self.tables["player_ratings"].append(
            {"user_id": uid, "queue": "1v1", "rating": 1016, "matches": 3, "wins": 2, "losses": 1}
        )

    async def get_user(self, access_token: str):
        self.auth_calls += 1
        return self.tokens.get(access_token)

    @staticmethod
    def _match(row: dict[str, Any], params: dict[str, str]) -> bool:
        for k, v in params.items():
            if k in ("select", "limit") or "." in k:
                continue
            if v.startswith("eq.") and str(row.get(k, "")).lower() != v[3:].lower():
                return False
        return True

    async def select(self, table: str, params: dict[str, str]):
        return [copy.deepcopy(r) for r in self.tables.get(table, []) if self._match(r, params)]

    async def update(self, table: str, filters: dict[str, str], body: dict[str, Any]):
        if table == "profiles" and "username" in body:
            for r in self.tables["profiles"]:
                if r["username"].lower() == body["username"].lower() and self._match(r, filters) is False:
                    raise SupabaseError(409, "23505", "duplicate key")
        out = []
        for r in self.tables.get(table, []):
            if self._match(r, filters):
                r.update(body)
                out.append(copy.deepcopy(r))
        return out

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self.storage[f"{bucket}/{path}"] = data

    async def remove(self, bucket: str, paths: list[str]) -> None:
        for p in paths:
            self.storage.pop(f"{bucket}/{p}", None)
