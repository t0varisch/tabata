# Табата

Интервальный таймер без рекламы: свои тренировки из блоков (сеты × работа / отдых, название и картинка по желанию), быстрый таймер, синхронизация между телефоном и компьютером через свой сервер с историей изменений.

Открыть: https://t0varisch.github.io/tabata/ — на Android: Chrome → меню → «Добавить на главный экран»; на компьютере: значок установки в адресной строке Chrome.

## Разработка

```bash
npm install
npm run dev          # локально
npm test             # юнит-тесты
npm run build && npx vite preview --port 4180
BASE=http://localhost:4180/ node scripts/e2e-smoke.mjs     # сквозная проверка 390/320 px
BASE=http://localhost:4180/ node scripts/offline-check.mjs # работа без сети
```

Push в `main` сам выкладывает на GitHub Pages (`.github/workflows/deploy.yml`).

## Сервер синхронизации

`server/` — FastAPI в Docker рядом с CRM на сервере, адрес `https://api.rehab-wellness.app/tabata/`. Данные — `~/tabata-data` (git-репозиторий: `workouts.json` + `images/`), каждое изменение — коммит. Выкладка — `server/deploy.sh`. Тесты: `cd server && uv run --with fastapi --with httpx --with pytest pytest -q`.
