#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Set SEED_ADMIN_PASSWORD before rerunning."
  exit 1
fi

docker compose -f infra/docker-compose.yml up --build -d
docker compose -f infra/docker-compose.yml exec -T api npm run seed:admin

curl -fsS http://localhost:3000/api/v1/health >/dev/null

ADMIN_EMAIL="$(grep '^SEED_ADMIN_EMAIL=' .env | cut -d= -f2-)"
ADMIN_PASSWORD="$(grep '^SEED_ADMIN_PASSWORD=' .env | cut -d= -f2-)"

curl -fsS http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" >/dev/null

echo "Smoke test passed: stack up, migrations applied, admin seeded, health ok, login ok."
