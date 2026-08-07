# Sornam AI API

Production backend foundation for Ayush-owned Sornam AI modules, implemented as a TypeScript modular monolith with NestJS, Prisma, PostgreSQL, Redis, BullMQ, Zod, and Jest.

## Local Setup

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

For local voice-sale testing without a live gold provider:

```env
GOLD_RATE_PROVIDER=static_configured
GOLD_RATE_STATIC_22K=6000
APP_ENV=local
```

Do not use the static provider in production.

## Migrations

```bash
cd apps/api
npx prisma migrate deploy
```

## Bootstrap Admin

Set a strong password in `.env`:

```env
SEED_ADMIN_EMAIL=admin@sornam.local
SEED_ADMIN_PASSWORD=replace-with-at-least-12-chars
SEED_ADMIN_FULL_NAME=Sornam Platform Admin
```

Then run:

```bash
cd apps/api
npm run build
npm run seed:admin
```

During local development, before building, use `npm run seed:admin:dev`.

## Smoke Test

After Docker is running:

```bash
./scripts/smoke-local.sh
```

This starts the stack, applies migrations through the API container command, seeds the platform admin, checks `/api/v1/health`, and verifies admin login.

## Web App

The product web app lives in `apps/web` and calls the real API endpoints for admin login, shop/user setup, voice session submission, confirmation, sale creation, and Owner Cockpit.

```bash
cd apps/web
npm install
npm run dev
```

## Tests

```bash
cd apps/api
npm install
npm test
```

Postgres-backed API e2e tests are opt-in because they clean the target database:

```bash
cd apps/api
DATABASE_URL='postgresql://sornam:sornam@localhost:5432/sornam_test?schema=public' npm run prisma:migrate
E2E_DATABASE_URL='postgresql://sornam:sornam@localhost:5432/sornam_test?schema=public' npm run test:e2e
```

## API Flow

Create shop:

```bash
curl -X POST http://localhost:3000/api/v1/shops \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sornam T Nagar"}'
```

Submit voice transcript:

```bash
curl -X POST http://localhost:3000/api/v1/voice/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"app_speak","transcript":"Sold 22 carat chain 18.5 grams making 12 percent to Lakshmi. Received 50000 cash rest pending."}'
```

Confirm voice sale:

```bash
curl -X POST http://localhost:3000/api/v1/voice/sessions/$SESSION_ID/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirmation":"yes"}'
```

Owner Cockpit:

```bash
curl -X POST http://localhost:3000/api/v1/owner-cockpit/query \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"How much did we sell today and who has not paid?"}'
```

## Integration Boundaries

Customer communication modules should consume `internal_events` rows for `customer.sale_recorded` and implement WhatsApp behavior behind `src/modules/integrations/whatsapp/whatsapp.interface.ts`.

Inventory and content modules should consume `internal_events` rows for `sale.confirmed` and implement stock/content behavior behind their integration interfaces.
