"""Thin async client for Supabase (Auth, PostgREST, Storage).

The service key never leaves this module: it is read from Settings and only sent from
the server to Supabase. Every call has a timeout; errors surface as SupabaseError.
"""

from __future__ import annotations

from typing import Any, Protocol

import httpx

from app.core.config import Settings


class SupabaseError(Exception):
    def __init__(self, status: int, code: str = "", message: str = "") -> None:
        super().__init__(f"supabase {status} {code}")
        self.status = status
        self.code = code
        self.message = message


class SupabaseGateway(Protocol):
    """Interface used by the routes (lets tests swap in a fake)."""

    async def get_user(self, access_token: str) -> dict[str, Any] | None: ...
    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...
    async def update(self, table: str, filters: dict[str, str], body: dict[str, Any]) -> list[dict[str, Any]]: ...
    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None: ...
    async def remove(self, bucket: str, paths: list[str]) -> None: ...
    async def insert(self, table: str, rows: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]: ...
    async def delete(self, table: str, filters: dict[str, str]) -> None: ...
    async def rpc(self, fn: str, args: dict[str, Any]) -> Any: ...


class SupabaseClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
        self.url = settings.supabase_url.rstrip("/")
        self._anon = settings.supabase_anon_key
        self._service = settings.supabase_service_role_key
        self._http = client or httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0))

    def _service_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        # New-style secret keys go in `apikey` only; legacy JWT keys also accept Authorization.
        h = {"apikey": self._service}
        if self._service.startswith("eyJ"):
            h["Authorization"] = f"Bearer {self._service}"
        if extra:
            h.update(extra)
        return h

    @staticmethod
    def _raise(r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        code = ""
        message = ""
        try:
            body = r.json()
            code = str(body.get("code", "") or body.get("error_code", ""))
            message = str(body.get("message", "") or body.get("msg", ""))
        except ValueError:
            pass
        raise SupabaseError(r.status_code, code, message)

    async def get_user(self, access_token: str) -> dict[str, Any] | None:
        """Server-side token validation: Supabase Auth checks signature, expiry and revocation."""
        r = await self._http.get(
            f"{self.url}/auth/v1/user",
            headers={"apikey": self._anon, "Authorization": f"Bearer {access_token}"},
        )
        if r.status_code in (401, 403):
            return None
        self._raise(r)
        return r.json()

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        r = await self._http.get(f"{self.url}/rest/v1/{table}", params=params, headers=self._service_headers())
        self._raise(r)
        return r.json()

    async def update(self, table: str, filters: dict[str, str], body: dict[str, Any]) -> list[dict[str, Any]]:
        r = await self._http.patch(
            f"{self.url}/rest/v1/{table}",
            params=filters,
            json=body,
            headers=self._service_headers({"Prefer": "return=representation"}),
        )
        self._raise(r)
        return r.json()

    async def insert(self, table: str, rows: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        r = await self._http.post(
            f"{self.url}/rest/v1/{table}",
            json=rows,
            headers=self._service_headers({"Prefer": "return=representation"}),
        )
        self._raise(r)
        return r.json()

    async def delete(self, table: str, filters: dict[str, str]) -> None:
        r = await self._http.delete(f"{self.url}/rest/v1/{table}", params=filters, headers=self._service_headers())
        self._raise(r)

    async def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        r = await self._http.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, headers=self._service_headers())
        self._raise(r)
        return r.json() if r.content else None

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        r = await self._http.post(
            f"{self.url}/storage/v1/object/{bucket}/{path}",
            content=data,
            headers=self._service_headers({"Content-Type": content_type, "x-upsert": "false", "cache-control": "3600"}),
        )
        self._raise(r)

    async def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        r = await self._http.request(
            "DELETE",
            f"{self.url}/storage/v1/object/{bucket}",
            json={"prefixes": paths},
            headers=self._service_headers(),
        )
        self._raise(r)

    async def aclose(self) -> None:
        await self._http.aclose()
