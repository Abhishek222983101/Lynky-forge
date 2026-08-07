# Session Summary — Phase 0

**Date:** 8 Aug 2026
**Model used:** MiMo
**Time spent:** ~25 min

## Completed
- [x] Copied sornam-ai → lynky-forge, clean slate, fresh git init
- [x] Renamed @sornam-ai → @lynky-forge in both package.json files
- [x] Stripped all jewellery env vars from env.ts (GOLD_*, SARVAM_*, GEMINI_*, VEO_*, CONTENT_*, META_*, CLOUDINARY_*, REDIS_URL)
- [x] Added KIMI_API_KEY, KIMI_MODEL, KIMI_BASE_URL, NEXT_PUBLIC_API_URL, CRON_SECRET to env.ts
- [x] Rewrote .env.example for Lynky Forge
- [x] Created .env with Neon pooled connection string (gitignored)
- [x] Removed contentStorageDir from main.ts (jewellery-specific static serve)
- [x] Added dotenv/config import for .env loading
- [x] Installed npm deps + dotenv
- [x] Prisma generate + migrate deploy (9 sornam migrations applied to Neon)
- [x] Seeded admin: admin@forge.demo / DemoPass12345!
- [x] Smoke test: login returns JWT on localhost:3001
- [x] Committed: "chore: phase 0 — rename sornam → lynky, env surgery, Neon DB connected, login verified"

## In progress / blocked
- None

## Files touched
- `.env.example` — rewritten for Lynky Forge (no jewellery vars, add KIMI/CRON vars)
- `apps/api/package.json` — name: @lynky-forge/api
- `apps/api/src/common/config/env.ts` — stripped 60+ jewellery env vars, added 5 Lynky Forge vars
- `apps/api/src/main.ts` — removed contentStorageDir import and /media/content static serve, added dotenv/config
- `apps/web/package.json` — name: @lynky-forge/web
- `apps/api/.env` — Neon connection string (gitignored, copied from root .env)
- `.env` — Neon + JWT + seed vars (gitignored)

## Decisions made (lock these)
- API runs on port 3001 (not 3000, which was in use)
- Password minimum 12 chars enforced by seed-admin.ts → using DemoPass12345!
- dotenv installed for .env loading (sornam didn't need it, we do)
- apps/api/.env is a copy of root .env (prisma + nestjs both need it)

## Next session
- Phase 1 — Backend Surgery (delete jewellery modules, schema strip, add mfg models, fresh migrate)
- Recommended model: K3 for schema design (1.3)
- Blockers to clear first: None
