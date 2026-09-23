"""Authentication dependency: `Authorization: Bearer <supabase access token>`.

The user id always comes from the validated token — never from the request body or path.
Validation is delegated to Supabase Auth (signature, expiry, revocation) and cached for a
short time per token hash to avoid one Auth call per request.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.core.logging import log_event
from app.repositories.supabase import SupabaseError, SupabaseGateway
from app.security.middleware import client_ip, ip_hash

CACHE_TTL_SECONDS = 60
MAX_TOKEN_LENGTH = 4096


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    is_anonymous: bool = False


class _TokenCache:
    def __init__(self, max_items: int = 5000) -> None:
        self._items: dict[str, tuple[float, AuthUser]] = {}
        self._max = max_items

    def get(self, key: str) -> AuthUser | None:
        hit = self._items.get(key)
        if not hit:
            return None
        expires, user = hit
        if expires < time.monotonic():
            self._items.pop(key, None)
            return None
        return user

    def put(self, key: str, user: AuthUser) -> None:
        if len(self._items) >= self._max:
            self._items.clear()
        self._items[key] = (time.monotonic() + CACHE_TTL_SECONDS, user)


_cache = _TokenCache()


def gateway(request: Request) -> SupabaseGateway:
    sb = getattr(request.app.state, "supabase", None)
    if sb is None:
        raise HTTPException(status_code=503, detail="service_unavailable")
    return sb


def _fail(request: Request, reason: str) -> HTTPException:
    log_event("AUTH_FAILURE", logging.WARNING, reason=reason, ip=ip_hash(client_ip(request)), path=request.url.path)
    return HTTPException(status_code=401, detail="unauthorized", headers={"WWW-Authenticate": "Bearer"})


async def current_user(request: Request) -> AuthUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _fail(request, "missing_token")
    if len(token) > MAX_TOKEN_LENGTH or token.count(".") != 2:
        raise _fail(request, "malformed_token")

    key = hashlib.sha256(token.encode()).hexdigest()
    cached = _cache.get(key)
    if cached:
        return cached

    sb = gateway(request)
    try:
        data = await sb.get_user(token)
    except SupabaseError:
        raise HTTPException(status_code=503, detail="auth_unavailable") from None
    if not data or not data.get("id"):
        raise _fail(request, "invalid_token")
    user = AuthUser(id=str(data["id"]), email=data.get("email"), is_anonymous=bool(data.get("is_anonymous")))
    _cache.put(key, user)
    return user
