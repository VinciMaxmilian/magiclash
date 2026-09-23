import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request, UploadFile

from app.core.logging import log_event
from app.repositories.supabase import SupabaseError, SupabaseGateway
from app.schemas.profiles import USERNAME_PATTERN, MyProfile, ProfileUpdate, PublicProfile, Rating, Stats
from app.security.auth import AuthUser, current_user, gateway
from app.security.rate_limit import InMemoryRateLimiter
from app.services.avatar import MAX_BYTES, AvatarError, process_avatar

router = APIRouter(prefix="/profiles", tags=["profiles"])

PROFILE_COLUMNS = "id,username,avatar_id,avatar_path,favorite_character,created_at"
# Writes are much rarer than reads: tighter per-user limit.
_write_limiter = InMemoryRateLimiter(per_minute=12, burst=6)


def _limit_writes(user: AuthUser) -> None:
    if not _write_limiter.allow(f"user:{user.id}"):
        log_event("RATE_LIMIT", logging.WARNING, user=user.id, scope="profile_write")
        raise HTTPException(status_code=429, detail="rate_limited")


def _avatar_url(request: Request, path: str | None) -> str | None:
    if not path:
        return None
    base = request.app.state.settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/avatars/{path}"


async def _load(sb: SupabaseGateway, request: Request, filters: dict[str, str]) -> tuple[dict[str, Any], PublicProfile]:
    rows = await sb.select("profiles", {"select": PROFILE_COLUMNS, **filters, "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="not_found")
    p = rows[0]
    stats_rows = await sb.select("player_stats", {"select": "matches,wins,losses,kos,deaths,damage_dealt", "user_id": f"eq.{p['id']}"})
    rating_rows = await sb.select(
        "player_ratings",
        {"select": "queue,rating,matches,wins,losses,seasons!inner(is_active)", "user_id": f"eq.{p['id']}", "seasons.is_active": "eq.true"},
    )
    public = PublicProfile(
        username=p["username"],
        avatar_id=p["avatar_id"],
        avatar_url=_avatar_url(request, p.get("avatar_path")),
        favorite_character=p["favorite_character"],
        created_at=p["created_at"],
        stats=Stats(**(stats_rows[0] if stats_rows else {})),
        ratings=[Rating(**{k: r[k] for k in ("queue", "rating", "matches", "wins", "losses")}) for r in rating_rows],
    )
    return p, public


@router.get("/me", response_model=MyProfile)
async def get_me(request: Request, user: AuthUser = Depends(current_user)) -> MyProfile:
    sb = gateway(request)
    _, public = await _load(sb, request, {"id": f"eq.{user.id}"})
    private = await sb.select("profiles_private", {"select": "settings", "user_id": f"eq.{user.id}"})
    return MyProfile(**public.model_dump(), id=user.id, email=user.email, settings=(private[0]["settings"] if private else {}))


@router.patch("/me", response_model=MyProfile)
async def update_me(body: ProfileUpdate, request: Request, user: AuthUser = Depends(current_user)) -> MyProfile:
    _limit_writes(user)
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="nothing_to_update")
    sb = gateway(request)
    if "avatar_id" in changes:
        changes["avatar_path"] = None  # picking a default avatar replaces an uploaded one
    try:
        updated = await sb.update("profiles", {"id": f"eq.{user.id}", "select": "avatar_path"}, changes)
    except SupabaseError as e:
        if e.code == "23505":  # unique violation on username
            raise HTTPException(status_code=409, detail="username_taken") from None
        raise HTTPException(status_code=502, detail="upstream_error") from None
    if not updated:
        raise HTTPException(status_code=404, detail="not_found")
    log_event("PROFILE_UPDATED", user=user.id, fields=sorted(body.model_dump(exclude_none=True).keys()))
    return await get_me(request, user)


@router.post("/me/avatar", response_model=MyProfile)
async def upload_avatar(file: UploadFile, request: Request, user: AuthUser = Depends(current_user)) -> MyProfile:
    _limit_writes(user)
    data = await file.read(MAX_BYTES + 1)
    try:
        avatar = process_avatar(data, file.filename)
    except AvatarError as e:
        log_event("INVALID_ACTION", logging.INFO, user=user.id, reason=f"avatar:{e.code}")
        raise HTTPException(status_code=413 if e.code == "file_too_large" else 422, detail=e.code) from None

    sb = gateway(request)
    old = await sb.select("profiles", {"select": "avatar_path", "id": f"eq.{user.id}"})
    path = f"{user.id}/{avatar.filename}"
    try:
        await sb.upload("avatars", path, avatar.data, avatar.content_type)
        await sb.update("profiles", {"id": f"eq.{user.id}"}, {"avatar_path": path})
    except SupabaseError:
        raise HTTPException(status_code=502, detail="upstream_error") from None
    old_path = old[0].get("avatar_path") if old else None
    if old_path and old_path != path:
        try:
            await sb.remove("avatars", [old_path])
        except SupabaseError:
            pass  # orphan cleanup is best-effort
    log_event("AVATAR_UPLOADED", user=user.id)
    return await get_me(request, user)


@router.get("/{username}", response_model=PublicProfile)
async def get_profile(request: Request, username: str = Path(pattern=USERNAME_PATTERN)) -> PublicProfile:
    if not re.fullmatch(USERNAME_PATTERN, username):
        raise HTTPException(status_code=404, detail="not_found")
    _, public = await _load(gateway(request), request, {"username": f"eq.{username}"})
    return public
