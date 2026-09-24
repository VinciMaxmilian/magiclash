"""Online play: guest identity, private rooms, matchmaking → join tokens for the realtime server.

The backend decides WHO may join WHICH match; the realtime server verifies the join token
and runs the match. Nothing here accepts gameplay data from clients.
"""

import logging
import random
import re
import secrets
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel, Field

from app.core.game_ids import STAGES, StageId
from app.core.logging import log_event
from app.repositories.supabase import SupabaseError, SupabaseGateway
from app.schemas.common import StrictModel
from app.security.auth import gateway
from app.security.middleware import client_ip, ip_hash
from app.security.player import Player, current_player
from app.security.rate_limit import InMemoryRateLimiter
from app.security.tokens import TokenError, issue_guest_token, issue_join_token, new_guest_id

router = APIRouter(tags=["online"])

ROOM_MODES: dict[str, tuple[str, int]] = {"duel": ("ffa", 2), "ffa": ("ffa", 4), "teams": ("teams", 4)}
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I/O/0/1
CODE_RE = re.compile(r"^[A-HJ-NP-Z2-9]{6}$")
# Same shape the DB check constraint enforces on profiles.avatar_path.
AVATAR_PATH_RE = re.compile(r"^[0-9a-f-]{36}/[0-9a-f]{32}\.webp$")
QUEUE_SIZE = {"1v1": 2}

_guest_limiter = InMemoryRateLimiter(per_minute=6, burst=4)
_room_limiter = InMemoryRateLimiter(per_minute=20, burst=8)


class GuestRequest(StrictModel):
    name: str = Field(pattern=r"^[A-Za-z0-9_]{3,12}$")


class GuestResponse(BaseModel):
    token: str
    guest_id: str
    name: str
    expires_in: int


class RoomCreate(StrictModel):
    mode: Literal["duel", "ffa", "teams"] = "duel"
    stage: StageId = "castle_courtyard"
    stocks: int = Field(default=3, ge=1, le=5)


class JoinResponse(BaseModel):
    token: str
    realtime_url: str
    match_id: str
    code: str | None
    mode: str
    stage: str
    stocks: int
    max_players: int


class TicketCreate(StrictModel):
    queue: Literal["1v1"] = "1v1"


class TicketResponse(BaseModel):
    ticket_id: str
    status: str
    join: JoinResponse | None = None


def _limit(limiter: InMemoryRateLimiter, key: str, scope: str) -> None:
    if not limiter.allow(key):
        log_event("RATE_LIMIT", logging.WARNING, scope=scope)
        raise HTTPException(status_code=429, detail="rate_limited")


# ── Guests ──────────────────────────────────────────────────────────────────


@router.post("/auth/guest", response_model=GuestResponse)
async def guest_login(body: GuestRequest, request: Request) -> GuestResponse:
    _limit(_guest_limiter, f"ip:{ip_hash(client_ip(request))}", "guest")
    secret = request.app.state.settings.guest_token_secret
    gid = new_guest_id()
    try:
        token = issue_guest_token(secret, gid, body.name)
    except TokenError:
        raise HTTPException(status_code=503, detail="service_unavailable") from None
    log_event("GUEST_CREATED", guest=gid)
    return GuestResponse(token=token, guest_id=gid, name=body.name, expires_in=12 * 3600)


# ── Join tokens ─────────────────────────────────────────────────────────────


async def _issue_join(request: Request, sb: SupabaseGateway, player: Player, match: dict[str, Any], code: str | None) -> JoinResponse:
    settings = request.app.state.settings
    claims = {
        "sub": player.id,
        "kind": player.kind,
        "name": player.name,
        "match": match["id"],
        "room": code,
        "mode": match["mode"],
        "stage": match["map_id"],
        "stocks": match["stocks"],
        "max_players": match["max_players"],
        "ranked": bool(match.get("ranked")),
    }
    if player.avatar_path and AVATAR_PATH_RE.fullmatch(player.avatar_path):
        claims["avatar"] = player.avatar_path
    try:
        token, jti = issue_join_token(settings.game_server_secret, claims)
    except TokenError:
        raise HTTPException(status_code=503, detail="service_unavailable") from None
    await sb.insert(
        "match_entries",
        {"match_id": match["id"], **player.owner_columns, "display_name": player.name, "jti": jti},
    )
    log_event("PLAYER_JOINED", match=match["id"], player=player.id, kind=player.kind)
    return JoinResponse(
        token=token,
        realtime_url=settings.realtime_url,
        match_id=match["id"],
        code=code,
        mode=match["mode"],
        stage=match["map_id"],
        stocks=match["stocks"],
        max_players=match["max_players"],
    )


async def _distinct_players(sb: SupabaseGateway, match_id: str) -> set[str]:
    rows = await sb.select("match_entries", {"select": "user_id,guest_id", "match_id": f"eq.{match_id}"})
    return {r["user_id"] or r["guest_id"] for r in rows}


# ── Private rooms ───────────────────────────────────────────────────────────


@router.post("/rooms", response_model=JoinResponse)
async def create_room(body: RoomCreate, request: Request, player: Player = Depends(current_player)) -> JoinResponse:
    _limit(_room_limiter, f"p:{player.id}", "rooms")
    sb = gateway(request)
    mode, max_players = ROOM_MODES[body.mode]
    match = (
        await sb.insert(
            "matches",
            {"mode": mode, "queue": "private", "map_id": body.stage, "status": "pending", "ranked": False,
             "stocks": body.stocks, "max_players": max_players},
        )
    )[0]
    code = None
    for _ in range(6):
        candidate = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        try:
            await sb.insert(
                "private_rooms",
                {"code": candidate, "match_id": match["id"],
                 "host_user": player.id if player.kind == "user" else None,
                 "host_guest": player.id if player.kind == "guest" else None},
            )
            code = candidate
            break
        except SupabaseError as e:
            if e.code != "23505":
                raise HTTPException(status_code=502, detail="upstream_error") from None
    if code is None:
        raise HTTPException(status_code=503, detail="try_again")
    await sb.update("matches", {"id": f"eq.{match['id']}"}, {"room_code": code})
    log_event("MATCH_CREATED", match=match["id"], room=code, mode=body.mode)
    return await _issue_join(request, sb, player, match, code)


@router.post("/rooms/{code}/join", response_model=JoinResponse)
async def join_room(request: Request, code: str = Path(min_length=6, max_length=6), player: Player = Depends(current_player)) -> JoinResponse:
    _limit(_room_limiter, f"p:{player.id}", "rooms")
    code = code.upper()
    if not CODE_RE.fullmatch(code):
        raise HTTPException(status_code=404, detail="room_not_found")
    sb = gateway(request)
    rooms = await sb.select("private_rooms", {"select": "code,match_id,expires_at", "code": f"eq.{code}"})
    if not rooms or datetime.fromisoformat(rooms[0]["expires_at"]) < datetime.now(UTC):
        raise HTTPException(status_code=404, detail="room_not_found")
    matches = await sb.select("matches", {"select": "id,mode,map_id,stocks,max_players,ranked,status", "id": f"eq.{rooms[0]['match_id']}"})
    if not matches or matches[0]["status"] != "pending":
        raise HTTPException(status_code=409, detail="room_closed")
    match = matches[0]
    players = await _distinct_players(sb, match["id"])
    if player.id not in players and len(players) >= match["max_players"]:
        raise HTTPException(status_code=409, detail="room_full")
    return await _issue_join(request, sb, player, match, code)


# ── Matchmaking ─────────────────────────────────────────────────────────────


async def _ticket(sb: SupabaseGateway, ticket_id: str, player: Player) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f-]{36}", ticket_id):
        raise HTTPException(status_code=404, detail="not_found")
    rows = await sb.select("matchmaking_tickets", {"select": "id,queue,status,match_id", "id": f"eq.{ticket_id}", **player.owner_filter})
    if not rows:
        raise HTTPException(status_code=404, detail="not_found")
    return rows[0]


async def _ticket_response(request: Request, sb: SupabaseGateway, t: dict[str, Any], player: Player) -> TicketResponse:
    if t["status"] == "searching":
        await sb.rpc("mm_try_match", {"p_queue": t["queue"], "p_needed": QUEUE_SIZE[t["queue"]], "p_map": random.choice(STAGES)})
        t = (await sb.select("matchmaking_tickets", {"select": "id,queue,status,match_id", "id": f"eq.{t['id']}"}))[0]
    if t["status"] != "matched":
        return TicketResponse(ticket_id=t["id"], status=t["status"])
    match = (await sb.select("matches", {"select": "id,mode,map_id,stocks,max_players,ranked,status", "id": f"eq.{t['match_id']}"}))[0]
    if match["status"] != "pending":
        return TicketResponse(ticket_id=t["id"], status="closed")
    return TicketResponse(ticket_id=t["id"], status="matched", join=await _issue_join(request, sb, player, match, None))


@router.post("/matchmaking/tickets", response_model=TicketResponse)
async def enqueue(body: TicketCreate, request: Request, player: Player = Depends(current_player)) -> TicketResponse:
    _limit(_room_limiter, f"p:{player.id}", "matchmaking")
    sb = gateway(request)
    # One active ticket per player.
    await sb.update("matchmaking_tickets", {**player.owner_filter, "status": "eq.searching"}, {"status": "cancelled"})
    t = (await sb.insert("matchmaking_tickets", {**player.owner_columns, "queue": body.queue, "character_id": "any"}))[0]
    return await _ticket_response(request, sb, t, player)


@router.get("/matchmaking/tickets/{ticket_id}", response_model=TicketResponse)
async def poll_ticket(request: Request, ticket_id: str, player: Player = Depends(current_player)) -> TicketResponse:
    sb = gateway(request)
    return await _ticket_response(request, sb, await _ticket(sb, ticket_id, player), player)


@router.delete("/matchmaking/tickets/{ticket_id}", response_model=TicketResponse)
async def cancel_ticket(request: Request, ticket_id: str, player: Player = Depends(current_player)) -> TicketResponse:
    sb = gateway(request)
    t = await _ticket(sb, ticket_id, player)
    if t["status"] == "searching":
        await sb.update("matchmaking_tickets", {"id": f"eq.{t['id']}"}, {"status": "cancelled"})
        t["status"] = "cancelled"
    return TicketResponse(ticket_id=t["id"], status=t["status"])
