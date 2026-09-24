"""Public leaderboards (docs/DATABASE.md → Leaderboards).

Read-only. Rows come from the `leaderboard` SQL function (service role only). The top of each
board is the same for every visitor, so it is cached briefly; "your position" is only looked up
when a valid account token is sent and the caller is not already in the top rows.
"""

import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.api.profiles import _avatar_url
from app.repositories.supabase import SupabaseError
from app.security.auth import gateway, optional_user

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

Period = Literal["season", "week", "month", "character"]
Queue = Literal["1v1"]  # the only ranked queue so far
CharacterId = Literal["knight", "barbarian", "archer", "fire_mage", "ice_mage", "lightning_mage"]

CACHE_TTL_SECONDS = 30
_cache: dict[tuple[Any, ...], tuple[float, list[dict[str, Any]]]] = {}


class LeaderboardEntry(BaseModel):
    position: int
    username: str
    avatar_id: str
    avatar_url: str | None
    score: int
    rating: int
    wins: int
    losses: int
    matches: int
    me: bool = False


class LeaderboardResponse(BaseModel):
    queue: Queue
    period: Period
    character: CharacterId | None
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None


async def _rows(request: Request, queue: str, period: str, character: str | None, limit: int, me: str | None) -> list[dict[str, Any]]:
    try:
        rows = await gateway(request).rpc(
            "leaderboard", {"p_queue": queue, "p_period": period, "p_character": character, "p_limit": limit, "p_me": me}
        )
    except SupabaseError:
        raise HTTPException(status_code=503, detail="service_unavailable") from None
    return rows if isinstance(rows, list) else []


def _entry(request: Request, r: dict[str, Any], me: str | None) -> LeaderboardEntry:
    return LeaderboardEntry(
        position=r["pos"],
        username=r["username"],
        avatar_id=r["avatar_id"],
        avatar_url=_avatar_url(request, r.get("avatar_path")),
        score=r["score"],
        rating=r["rating"],
        wins=r["wins"],
        losses=r["losses"],
        matches=r["matches"],
        me=me is not None and r["user_id"] == me,
    )


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    request: Request,
    queue: Queue = "1v1",
    period: Period = "season",
    character: CharacterId | None = None,
    limit: int = Query(20, ge=1, le=50),
) -> LeaderboardResponse:
    if period == "character" and character is None:
        raise HTTPException(status_code=422, detail="invalid_request")
    if period != "character":
        character = None
    user = await optional_user(request)
    me = user.id if user else None

    key = (queue, period, character, limit)
    hit = _cache.get(key)
    now = time.monotonic()
    if hit and hit[0] > now:
        top = hit[1]
    else:
        top = [r for r in await _rows(request, queue, period, character, limit, None) if r["pos"] <= limit]
        if len(_cache) > 256:
            _cache.clear()
        _cache[key] = (now + CACHE_TTL_SECONDS, top)

    mine = next((r for r in top if me and r["user_id"] == me), None)
    if me and mine is None:
        mine = next((r for r in await _rows(request, queue, period, character, limit, me) if r["user_id"] == me), None)

    return LeaderboardResponse(
        queue=queue,
        period=period,
        character=character,
        # user ids never leave the server; `me` marks the caller's own row
        entries=[_entry(request, r, me) for r in top],
        me=_entry(request, mine, me) if mine else None,
    )
