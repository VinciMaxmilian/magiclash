import pytest
from fastapi.testclient import TestClient

from app.api import leaderboard
from app.main import create_app
from app.security import auth as auth_module
from app.security.rate_limit import InMemoryRateLimiter
from tests.conftest import make_settings
from tests.fakes import FakeSupabase

ALICE = "11111111-1111-1111-1111-111111111111"
BOB = "22222222-2222-2222-2222-222222222222"
TOKEN_A = "aaa.bbb.ccc"


def row(pos: int, uid: str, name: str, score: int, period: str = "season", avatar_path: str | None = None) -> dict:
    return {"period": period, "pos": pos, "user_id": uid, "username": name, "avatar_id": "knight",
            "avatar_path": avatar_path, "score": score, "rating": score, "wins": 3, "losses": 1, "matches": 4}


@pytest.fixture
def sb() -> FakeSupabase:
    f = FakeSupabase()
    f.add_user(ALICE, "alice", TOKEN_A)
    f.leaderboard_rows = [row(i + 1, f"00000000-0000-0000-0000-{i:012d}", f"player{i}", 1400 - i) for i in range(25)]
    f.leaderboard_rows.append(row(26, ALICE, "alice", 1016, avatar_path=f"{ALICE}/{'ab' * 16}.webp"))
    return f


@pytest.fixture
def client(sb) -> TestClient:
    auth_module._cache = auth_module._TokenCache()
    leaderboard._cache.clear()
    app = create_app(make_settings(supabase_url="https://example.supabase.co"), InMemoryRateLimiter(10_000), supabase=sb)
    return TestClient(app)


def test_public_top_without_user_ids(client):
    r = client.get("/api/leaderboard")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [e["position"] for e in body["entries"]] == list(range(1, 21))
    assert body["me"] is None
    assert "user_id" not in r.text and ALICE not in r.text


def test_own_position_outside_top(client):
    body = client.get("/api/leaderboard?limit=10", headers={"Authorization": f"Bearer {TOKEN_A}"}).json()
    assert len(body["entries"]) == 10 and not any(e["me"] for e in body["entries"])
    assert body["me"]["position"] == 26 and body["me"]["me"] is True
    assert body["me"]["avatar_url"].startswith("https://example.supabase.co/storage/v1/object/public/avatars/")


def test_invalid_token_is_just_anonymous(client):
    r = client.get("/api/leaderboard", headers={"Authorization": "Bearer x.y.z"})
    assert r.status_code == 200 and r.json()["me"] is None


def test_top_is_cached(client, sb):
    client.get("/api/leaderboard")
    client.get("/api/leaderboard")
    assert sum(1 for fn, _ in sb.rpc_calls if fn == "leaderboard") == 1


@pytest.mark.parametrize(
    "query",
    ["period=character", "period=forever", "queue=2v2", "character=dragon&period=character", "limit=500", "limit=0"],
)
def test_bad_queries_rejected(client, query):
    assert client.get(f"/api/leaderboard?{query}").status_code == 422


def test_character_board_passes_character(client, sb):
    sb.leaderboard_rows.append(row(1, BOB, "bob", 7, period="character"))
    body = client.get("/api/leaderboard?period=character&character=archer").json()
    assert body["character"] == "archer" and body["entries"][0]["username"] == "bob"
    fn, args = sb.rpc_calls[-1]
    assert args["p_character"] == "archer" and args["p_period"] == "character"
