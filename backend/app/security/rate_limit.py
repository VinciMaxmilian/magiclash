import threading
import time
from dataclasses import dataclass
from typing import Protocol


class RateLimiter(Protocol):
    def allow(self, key: str) -> bool: ...


@dataclass
class _Bucket:
    tokens: float
    updated: float


class InMemoryRateLimiter:
    """Token bucket per key.

    Serverless caveat: each Vercel instance has its own memory, so this is a best-effort
    first line of defence. Sensitive endpoints (auth, matchmaking) use a shared store
    (Upstash Redis / Postgres) behind this same interface in production.
    """

    def __init__(self, per_minute: int, burst: int | None = None, clock=time.monotonic) -> None:
        self.rate = per_minute / 60.0
        self.capacity = float(burst if burst is not None else per_minute)
        self.clock = clock
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self.clock()
        with self._lock:
            b = self._buckets.get(key)
            if b is None:
                b = _Bucket(tokens=self.capacity, updated=now)
                self._buckets[key] = b
            b.tokens = min(self.capacity, b.tokens + (now - b.updated) * self.rate)
            b.updated = now
            if b.tokens < 1:
                return False
            b.tokens -= 1
            if len(self._buckets) > 50_000:  # bound memory under abuse
                self._buckets.clear()
            return True
