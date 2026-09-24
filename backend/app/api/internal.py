"""Server-to-server endpoints. Only the realtime game server can call these: every request
is HMAC-signed with GAME_SERVER_SECRET (timestamp + raw body), replay-protected, and then
cross-checked in the database by record_match_result (issued join tokens, stat sanity,
idempotency). There is no client-reachable way to submit a result.
"""

import json
import logging
import re
import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import Field, ValidationError, field_validator

from app.core.logging import log_event
from app.repositories.supabase import SupabaseError
from app.schemas.common import StrictModel
from app.security.auth import gateway
from app.security.tokens import ReplayGuard, TokenError, verify_signature

router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)
_replay = ReplayGuard()

CharacterId = Literal["knight", "barbarian", "archer", "fire_mage", "ice_mage", "lightning_mage"]


class ParticipantResult(StrictModel):
    slot: int = Field(ge=0, le=3)
    kind: Literal["user", "guest"]
    id: str = Field(max_length=64)
    name: str = Field(pattern=r"^[A-Za-z0-9_]{3,16}$")
    character_id: CharacterId
    team: int = Field(ge=0, le=3)
    placement: int = Field(ge=1, le=4)
    kos: int = Field(ge=0, le=99)
    deaths: int = Field(ge=0, le=5)
    damage_dealt: int = Field(ge=0, le=99_999)

    @field_validator("id")
    @classmethod
    def id_shape(cls, v: str, info) -> str:
        if not (re.fullmatch(r"[0-9a-f-]{36}", v) or re.fullmatch(r"g_[0-9a-f]{16}", v)):
            raise ValueError("bad id")
        return v


class MatchResult(StrictModel):
    duration_ticks: int = Field(ge=0, le=60 * 60 * 15)
    winner_team: int = Field(ge=-1, le=3)
    participants: list[ParticipantResult] = Field(min_length=2, max_length=4)
    suspicious: list[str] = Field(default_factory=list, max_length=20)


@router.post("/matches/{match_id}/result")
async def record_result(request: Request, match_id: str = Path(pattern=r"^[0-9a-f-]{36}$")) -> dict[str, Any]:
    raw = await request.body()
    secret = request.app.state.settings.game_server_secret
    try:
        verify_signature(
            secret,
            request.headers.get("x-timestamp", ""),
            raw,
            request.headers.get("x-signature", ""),
            _replay,
            now=time.time(),
        )
    except TokenError as e:
        log_event("AUTH_FAILURE", logging.WARNING, scope="internal_result", reason=str(e), match=match_id)
        raise HTTPException(status_code=401, detail="unauthorized") from None

    try:
        result = MatchResult.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        log_event("SUSPICIOUS_MATCH", logging.WARNING, match=match_id, reason="malformed_result")
        raise HTTPException(status_code=422, detail="invalid_request") from None

    sb = gateway(request)
    if result.suspicious:
        log_event("SUSPICIOUS_MATCH", logging.WARNING, match=match_id, flags=result.suspicious[:20])
        await sb.insert(
            "security_events",
            {"type": "SUSPICIOUS_MATCH", "severity": "warning", "match_id": match_id, "details": {"flags": result.suspicious[:20]}},
        )

    participants = [
        {
            "slot": p.slot,
            "user_id": p.id if p.kind == "user" else None,
            "guest_id": p.id if p.kind == "guest" else None,
            "name": p.name,
            "character_id": p.character_id,
            "team": p.team,
            "placement": p.placement,
            "kos": p.kos,
            "deaths": p.deaths,
            "damage_dealt": p.damage_dealt,
        }
        for p in result.participants
    ]
    try:
        outcome = await sb.rpc(
            "record_match_result",
            {"p_match": match_id, "p_duration_ticks": result.duration_ticks, "p_winner_team": result.winner_team, "p_participants": participants},
        )
    except SupabaseError as e:
        if "already_recorded" in e.message:
            raise HTTPException(status_code=409, detail="already_recorded") from None
        if "unknown_match" in e.message:
            raise HTTPException(status_code=404, detail="not_found") from None
        log_event("SUSPICIOUS_MATCH", logging.WARNING, match=match_id, reason=e.message[:80] or e.code)
        raise HTTPException(status_code=422, detail="rejected") from None
    rated, ratings = _rating_changes(outcome)
    log_event("MATCH_FINISHED", match=match_id, winner_team=result.winner_team, players=len(participants), rated=rated)
    # The game server forwards these to the players (results screen). Slots only, no user ids.
    return {"status": "recorded", "rated": rated, "ratings": ratings}


def _rating_changes(outcome: Any) -> tuple[bool, list[dict[str, int]]]:
    if not isinstance(outcome, dict):
        return False, []
    ratings = []
    for r in outcome.get("ratings") or []:
        try:
            ratings.append({"slot": int(r["slot"]), "before": int(r["before"]), "after": int(r["after"])})
        except (KeyError, TypeError, ValueError):
            continue
    return bool(outcome.get("rated")), ratings[:4]
