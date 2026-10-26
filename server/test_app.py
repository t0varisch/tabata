import hashlib
import subprocess

import pytest
from fastapi.testclient import TestClient

from app import create_app

KEY = "secret-key"
AUTH = {"Authorization": f"Bearer {KEY}"}


def workout(wid="w1", updated=1000, name="Утро", image=None, deleted=None):
    w = {
        "id": wid,
        "name": name,
        "prep": 5,
        "finalRest": False,
        "blocks": [{"id": "b1", "name": "Гантели", "image": image, "sets": 4, "work": 30, "rest": 30}],
        "updatedAt": updated,
    }
    if deleted is not None:
        w["deleted"] = deleted
    return w


@pytest.fixture
def env(tmp_path):
    data = tmp_path / "data"
    client = TestClient(create_app(data, KEY))

    def commits():
        r = subprocess.run(["git", "-C", str(data), "rev-list", "--count", "HEAD"], capture_output=True, text=True)
        return int(r.stdout.strip()) if r.returncode == 0 else 0

    return client, data, commits


def sync(client, workouts, device="phone"):
    return client.post("/sync", json={"workouts": workouts, "device": device}, headers=AUTH)


def test_health_without_key(env):
    client, _, _ = env
    assert client.get("/health").json() == {"ok": True}


def test_wrong_or_missing_key_is_401(env):
    client, _, _ = env
    assert client.post("/sync", json={"workouts": [], "device": "x"}).status_code == 401
    bad = {"Authorization": "Bearer nope"}
    assert client.post("/sync", json={"workouts": [], "device": "x"}, headers=bad).status_code == 401
    assert client.put("/images/" + "0" * 64, content=b"x", headers=bad).status_code == 401
    assert client.get("/images/" + "0" * 64, headers=bad).status_code == 401


def test_new_workout_is_saved_and_committed(env):
    client, data, commits = env
    r = sync(client, [workout()])
    assert r.status_code == 200
    assert [w["id"] for w in r.json()["workouts"]] == ["w1"]
    assert '"Утро"' in (data / "workouts.json").read_text(encoding="utf-8")
    assert commits() == 1


def test_older_version_does_not_win_and_no_commit(env):
    client, _, commits = env
    sync(client, [workout(updated=2000, name="Новое")])
    r = sync(client, [workout(updated=1000, name="Старое")], device="pc")
    assert r.json()["workouts"][0]["name"] == "Новое"
    assert commits() == 1


def test_equal_timestamp_keeps_server_version(env):
    client, _, _ = env
    sync(client, [workout(updated=2000, name="Сервер")])
    r = sync(client, [workout(updated=2000, name="Клиент")])
    assert r.json()["workouts"][0]["name"] == "Сервер"


def test_two_devices_edit_different_workouts(env):
    client, _, commits = env
    sync(client, [workout("a", 1000)], device="phone")
    r = sync(client, [workout("b", 1100)], device="pc")
    assert sorted(w["id"] for w in r.json()["workouts"]) == ["a", "b"]
    assert commits() == 2


def test_delete_mark_is_kept(env):
    client, _, _ = env
    sync(client, [workout(updated=1000)])
    r = sync(client, [workout(updated=1500, deleted=True)])
    assert r.json()["workouts"][0]["deleted"] is True


def test_image_upload_checks_hash_and_size(env):
    client, data, _ = env
    body = b"GIF89a-fake-image"
    sha = hashlib.sha256(body).hexdigest()
    sync(client, [workout(image=sha)])
    assert client.post("/sync", json={"workouts": [], "device": "x"}, headers=AUTH).json()["missingImages"] == [sha]
    bad = client.put(f"/images/{sha}", content=b"other", headers={**AUTH, "Content-Type": "image/gif"})
    assert bad.status_code == 400
    big = b"x" * (3 * 1024 * 1024 + 1)
    too_big = client.put(f"/images/{hashlib.sha256(big).hexdigest()}", content=big, headers={**AUTH, "Content-Type": "image/gif"})
    assert too_big.status_code == 413
    ok = client.put(f"/images/{sha}", content=body, headers={**AUTH, "Content-Type": "image/gif"})
    assert ok.status_code == 204
    assert (data / "images" / f"{sha}.gif").exists()
    assert client.post("/sync", json={"workouts": [], "device": "x"}, headers=AUTH).json()["missingImages"] == []
    got = client.get(f"/images/{sha}", headers=AUTH)
    assert got.status_code == 200 and got.content == body and got.headers["content-type"] == "image/gif"


def test_get_unknown_or_bad_image(env):
    client, _, _ = env
    assert client.get("/images/" + "a" * 64, headers=AUTH).status_code == 404
    assert client.get("/images/..%2Fworkouts.json", headers=AUTH).status_code in (400, 404)


def test_sync_body_limit(env):
    client, _, _ = env
    huge = [workout(f"w{i}", name="x" * 2000) for i in range(600)]
    assert sync(client, huge).status_code == 413


def test_cors_preflight_for_pages(env):
    client, _, _ = env
    r = client.options(
        "/sync",
        headers={"Origin": "https://t0varisch.github.io", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "https://t0varisch.github.io"
