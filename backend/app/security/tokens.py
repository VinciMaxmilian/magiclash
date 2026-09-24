"""Short-lived signed tokens (HS256).

- Guest tokens: identify an account-less player for online play (12 h).
- Join tokens: admit ONE player into ONE match on the realtime server (120 s, single use via jti).
- Result signatures: the realtime server signs match results (HMAC-SHA256 over ts + body).

Secrets come only from server-side env. Algorithms are pinned (no `alg` confusion).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Any

import jwt

ISSUER = "magiclash-api"
REALTIME_AUDIENCE = "magiclash-realtime"
GUEST_AUDIENCE = "magiclash-guest"
GUEST_TTL = 12 * 3600
JOIN_TTL = 120
SIGNATURE_WINDOW = 60


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class GuestIdentity:
    guest_id: str
    name: str


def new_guest_id() -> str:
    return "g_" + secrets.token_hex(8)


def issue_guest_token(secret: str, guest_id: str, name: str, now: float | None = None) -> str:
    if not secret:
        raise TokenError("guest tokens not configured")
    t = int(now or time.time())
    return jwt.encode(
        {"iss": ISSUER, "aud": GUEST_AUDIENCE, "sub": guest_id, "name": name, "typ": "guest", "iat": t, "exp": t + GUEST_TTL},
        secret,
        algorithm="HS256",
    )


def verify_guest_token(secret: str, token: str) -> GuestIdentity:
    if not secret:
        raise TokenError("guest tokens not configured")
    try:
        claims = jwt.decode(
            token, secret, algorithms=["HS256"], audience=GUEST_AUDIENCE, issuer=ISSUER,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as e:
        raise TokenError(str(e)) from None
    if claims.get("typ") != "guest" or not str(claims.get("sub", "")).startswith("g_"):
        raise TokenError("not a guest token")
    return GuestIdentity(guest_id=claims["sub"], name=str(claims.get("name", "")))


def issue_join_token(secret: str, claims: dict[str, Any], now: float | None = None) -> tuple[str, str]:
    """Returns (token, jti)."""
    if not secret:
        raise TokenError("game server secret not configured")
    t = int(now or time.time())
    jti = secrets.token_hex(16)
    token = jwt.encode(
        {**claims, "iss": ISSUER, "aud": REALTIME_AUDIENCE, "iat": t, "exp": t + JOIN_TTL, "jti": jti},
        secret,
        algorithm="HS256",
    )
    return token, jti


def sign_body(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


class ReplayGuard:
    """Remembers recently seen signatures so a captured request can't be replayed."""

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}

    def check_and_store(self, sig: str, now: float) -> bool:
        for k in [k for k, exp in self._seen.items() if exp < now]:
            self._seen.pop(k, None)
        if sig in self._seen:
            return False
        self._seen[sig] = now + SIGNATURE_WINDOW * 2
        return True


def verify_signature(secret: str, timestamp: str, body: bytes, signature: str, guard: ReplayGuard, now: float | None = None) -> None:
    if not secret:
        raise TokenError("game server secret not configured")
    t = now or time.time()
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        raise TokenError("bad timestamp") from None
    if abs(t - ts) > SIGNATURE_WINDOW:
        raise TokenError("stale")
    expected = sign_body(secret, timestamp, body)
    if not hmac.compare_digest(expected, signature or ""):
        raise TokenError("bad signature")
    if not guard.check_and_store(signature, t):
        raise TokenError("replay")
