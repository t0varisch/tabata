#!/usr/bin/env bash
# Выкладка сервера синхронизации Табаты на сервер Романа.
# CRM не трогает: отдельная папка ~/tabata, данные ~/tabata-data, контейнер tabata-sync в сети CRM.
# Запуск из корня репозитория: bash server/deploy.sh
set -euo pipefail
HOST="${HOST:-roman@157.173.102.230}"

tar -C "$(dirname "$0")" -cf - app.py requirements.txt Dockerfile docker-compose.yml |
	ssh "$HOST" 'mkdir -p ~/tabata ~/tabata-data && tar -C ~/tabata -xf -'

# Ключ создаётся один раз и живёт только на сервере
ssh "$HOST" 'test -f ~/tabata/.env || (umask 077; printf "TABATA_KEY=%s\nDATA_DIR=/data\n" "$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")" > ~/tabata/.env)'

ssh "$HOST" 'cd ~/tabata && docker compose up -d --build 2>&1 | tail -3'

for i in $(seq 1 20); do
	health=$(ssh "$HOST" 'docker exec rehabcrm-caddy wget -qO- http://tabata-sync:8080/health' 2>/dev/null || true)
	if [ -n "$health" ]; then
		echo "$health"
		case "$health" in
		*'"history":true'*) echo "tabata-sync: жив внутри сети CRM, история пишется"; exit 0 ;;
		*) echo "tabata-sync жив, но git не работает — истории нет. Логи: ssh $HOST 'docker logs --tail 50 tabata-sync'" >&2; exit 1 ;;
		esac
	fi
	sleep 2
done
echo "tabata-sync не ответил — логи: ssh $HOST 'docker logs --tail 50 tabata-sync'" >&2
exit 1
