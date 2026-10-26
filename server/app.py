"""Сервер синхронизации Табаты.

Хранит тренировки в workouts.json и картинки в images/ внутри git-репозитория:
каждое изменение — коммит, история — git log. Слияние «последнее изменение
побеждает» по updatedAt на уровне одной тренировки.

Запуск: uvicorn app:main --factory --host 0.0.0.0 --port 8080
Окружение: TABATA_KEY — ключ доступа, DATA_DIR — папка данных (/data).
"""

import hashlib
import json
import os
import re
import secrets
import subprocess
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ValidationError

MAX_SYNC_BYTES = 1024 * 1024
MAX_IMAGE_BYTES = 3 * 1024 * 1024
ORIGINS = ["https://t0varisch.github.io", "http://localhost:5173", "http://localhost:4173"]
IMAGE_TYPES = {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class Block(BaseModel):
    id: str
    name: str
    image: str | None
    sets: int
    work: int
    rest: int


class Workout(BaseModel):
    id: str
    name: str
    prep: int
    finalRest: bool
    blocks: list[Block]
    updatedAt: int
    deleted: bool | None = None


class SyncIn(BaseModel):
    workouts: list[Workout]
    device: str = "?"


def dump(w: Workout) -> dict:
    d = w.model_dump()
    if not d.get("deleted"):
        d.pop("deleted", None)
    return d


class Repo:
    def __init__(self, root: Path):
        self.root = root
        self.lock = threading.Lock()
        (root / "images").mkdir(parents=True, exist_ok=True)
        if not (root / ".git").exists():
            self.git("init", "-q", "-b", "main")
            self.git("config", "user.name", "tabata-sync")
            self.git("config", "user.email", "tabata-sync@localhost")

    def git(self, *args: str) -> None:
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def commit(self, paths: list[str], message: str) -> None:
        self.git("add", *paths)
        self.git("commit", "-q", "-m", message)

    def load(self) -> dict[str, dict]:
        f = self.root / "workouts.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}

    def save(self, data: dict[str, dict]) -> None:
        f = self.root / "workouts.json"
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(tmp, f)

    def image_path(self, sha: str) -> Path | None:
        found = list((self.root / "images").glob(f"{sha}.*"))
        return found[0] if found else None


def create_app(data_dir: Path, key: str) -> FastAPI:
    repo = Repo(data_dir)
    app = FastAPI(title="tabata-sync", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ORIGINS,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=86400,
    )

    def auth(request: Request) -> None:
        given = request.headers.get("authorization", "")
        if not secrets.compare_digest(given.encode(), f"Bearer {key}".encode()):
            raise HTTPException(401, "bad key")

    def missing_images(data: dict[str, dict]) -> list[str]:
        shas = {b["image"] for w in data.values() if not w.get("deleted") for b in w["blocks"] if b.get("image")}
        return sorted(s for s in shas if repo.image_path(s) is None)

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/sync", dependencies=[Depends(auth)])
    async def sync(request: Request):
        body = await request.body()
        if len(body) > MAX_SYNC_BYTES:
            raise HTTPException(413, "too large")
        try:
            incoming = SyncIn.model_validate_json(body)
        except ValidationError as e:
            raise HTTPException(422, str(e)) from e
        with repo.lock:
            data = repo.load()
            added = changed = deleted = 0
            for w in incoming.workouts:
                old = data.get(w.id)
                if old is not None and old["updatedAt"] >= w.updatedAt:
                    continue
                if old is None:
                    added += 1
                elif w.deleted and not old.get("deleted"):
                    deleted += 1
                else:
                    changed += 1
                data[w.id] = dump(w)
            if added or changed or deleted:
                repo.save(data)
                device = re.sub(r"[^\w .-]", "", incoming.device)[:40] or "?"
                repo.commit(["workouts.json"], f"sync {device}: +{added} ~{changed} -{deleted}")
        return {"workouts": list(data.values()), "missingImages": missing_images(data)}

    @app.put("/images/{sha}", dependencies=[Depends(auth)], status_code=204)
    async def put_image(sha: str, request: Request):
        if not SHA_RE.match(sha):
            raise HTTPException(400, "bad sha")
        body = await request.body()
        if len(body) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "too large")
        if hashlib.sha256(body).hexdigest() != sha:
            raise HTTPException(400, "hash mismatch")
        ext = IMAGE_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip())
        if ext is None:
            raise HTTPException(415, "unsupported type")
        with repo.lock:
            if repo.image_path(sha) is None:
                (repo.root / "images" / f"{sha}.{ext}").write_bytes(body)
                repo.commit([f"images/{sha}.{ext}"], f"image {sha[:8]}")
        return Response(status_code=204)

    @app.get("/images/{sha}", dependencies=[Depends(auth)])
    def get_image(sha: str):
        if not SHA_RE.match(sha):
            raise HTTPException(400, "bad sha")
        path = repo.image_path(sha)
        if path is None:
            raise HTTPException(404, "not found")
        media = {v: k for k, v in IMAGE_TYPES.items()}[path.suffix[1:]]
        return FileResponse(path, media_type=media, headers={"Cache-Control": "private, max-age=31536000, immutable"})

    return app


def main() -> FastAPI:
    return create_app(Path(os.environ.get("DATA_DIR", "/data")), os.environ["TABATA_KEY"])
