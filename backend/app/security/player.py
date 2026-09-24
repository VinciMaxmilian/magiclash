"""Online identity: an account (Supabase token) or a guest (our signed guest token)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, Request

from app.security.auth import current_user, gateway
from app.security.tokens import TokenError, verify_guest_token


@dataclass(frozen=True)
class Player:
    kind: Literal["user", "guest"]
    id: str
    name: str
    # Storage path of the uploaded profile photo (accounts only). Never a client-supplied URL.
    avatar_path: str | None = None

    @property
    def owner_filter(self) -> dict[str, str]:
        """PostgREST filter selecting rows owned by this player."""
        return {"user_id": f"eq.{self.id}"} if self.kind == "user" else {"guest_id": f"eq.{self.id}"}

    @property
    def owner_columns(self) -> dict[str, str | None]:
        return {"user_id": self.id, "guest_id": None} if self.kind == "user" else {"user_id": None, "guest_id": self.id}


async def current_player(request: Request) -> Player:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    secret = request.app.state.settings.guest_token_secret
    if scheme.lower() == "bearer" and token and secret:
        try:
            g = verify_guest_token(secret, token)
            return Player(kind="guest", id=g.guest_id, name=g.name)
        except TokenError:
            pass  # not a guest token → try Supabase
    user = await current_user(request)
    rows = await gateway(request).select("profiles", {"select": "username,avatar_path", "id": f"eq.{user.id}"})
    if not rows:
        raise HTTPException(status_code=403, detail="no_profile")
    return Player(kind="user", id=user.id, name=rows[0]["username"], avatar_path=rows[0].get("avatar_path"))
