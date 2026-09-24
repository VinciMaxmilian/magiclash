"""In-memory stand-in for SupabaseGateway (unit tests; the real thing has integration tests)."""

from __future__ import annotations

import copy
import uuid
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
            "matches": [],
            "private_rooms": [],
            "match_entries": [],
            "matchmaking_tickets": [],
            "security_events": [],
        }
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self.recorded: set[str] = set()
        self.record_outcome: dict[str, Any] = {"rated": False, "ratings": []}
        self.leaderboard_rows: list[dict[str, Any]] = []
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

    async def insert(self, table: str, rows):
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for r in rows:
            r = dict(r)
            if table == "private_rooms" and any(x["code"] == r["code"] for x in self.tables[table]):
                raise SupabaseError(409, "23505", "duplicate")
            if table in ("matches", "matchmaking_tickets"):
                r.setdefault("id", str(uuid.uuid4()))
            if table == "matchmaking_tickets":
                r.setdefault("status", "searching")
                r.setdefault("match_id", None)
            if table == "private_rooms":
                r.setdefault("expires_at", "2999-01-01T00:00:00+00:00")
            self.tables.setdefault(table, []).append(r)
            out.append(copy.deepcopy(r))
        return out

    async def delete(self, table: str, filters: dict[str, str]) -> None:
        self.tables[table] = [r for r in self.tables.get(table, []) if not self._match(r, filters)]

    async def rpc(self, fn: str, args: dict[str, Any]):
        self.rpc_calls.append((fn, args))
        if fn == "mm_try_match":
            waiting = [t for t in self.tables["matchmaking_tickets"] if t["status"] == "searching" and t["queue"] == args["p_queue"]]
            if len(waiting) < args["p_needed"]:
                return None
            m = (await self.insert("matches", {"mode": "ffa", "queue": args["p_queue"], "map_id": args["p_map"],
                                                "status": "pending", "ranked": True, "stocks": 3, "max_players": args["p_needed"]}))[0]
            for t in waiting[: args["p_needed"]]:
                t["status"] = "matched"
                t["match_id"] = m["id"]
            return m["id"]
        if fn == "record_match_result":
            if args["p_match"] in self.recorded:
                raise SupabaseError(400, "P0001", "already_recorded")
            self.recorded.add(args["p_match"])
            return self.record_outcome
        if fn == "leaderboard":
            rows = [r for r in self.leaderboard_rows if r.get("period", "season") == args["p_period"]]
            return [
                {k: v for k, v in r.items() if k != "period"}
                for r in rows
                if r["pos"] <= args["p_limit"] or r["user_id"] == args["p_me"]
            ]
        raise SupabaseError(404, "PGRST202", "unknown function")

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self.storage[f"{bucket}/{path}"] = data

    async def remove(self, bucket: str, paths: list[str]) -> None:
        for p in paths:
            self.storage.pop(f"{bucket}/{p}", None)
