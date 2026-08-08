# Session Summary — Phase 2 (Core API)

**Date:** 8 Aug 2026
**Model used:** K3 (full phase — critical-path logic)
**Time spent:** ~1.5h

## Completed

- [x] 2.0 Automations module — `runStageChange(tx, ctx)` sync engine inside caller's `$transaction`
  - QUOTE_SENT → idempotent 3-day follow-up Task (1h idempotency window)
  - WON → Order auto-created (ORD-YYYY-NNNN sequential) + DEAL_WON activity
  - LOST → DEAL_LOST activity
- [x] 2.1 Companies + Contacts — CRUD, `?q=`/`?industry=` filters, Company 360 (`?include=deals,contacts,activities,tasks`), primary-contact demotion rule
- [x] 2.2 Deals + stage move — full `$transaction`: fetch → validate (terminal-stage lock, LOST requires lostReason, same-stage 400) → update → STAGE_CHANGE activity → automations → audit. Returns `{ deal, order, activity, tasksCreated }`
- [x] 2.3 RFQs — one-shot intake creates Company (optional) → Deal (NEW_RFQ) → RFQ atomically; deal value defaults to `targetPrice × qty`
- [x] 2.3 Quotes — auto `quoteNo` (Q-YYYY-NNNN per shop), server-side total via decimal.js, 1:1 with deal (409 on dup), status state machine (DRAFT→SENT→ACCEPTED/REJECTED/EXPIRED), SENT auto-advances deal to QUOTE_SENT → fires follow-up automation
- [x] 2.4 Tasks — CRUD + `?overdue=true` filter + status updates
- [x] 2.4 Activities — deal timeline, company timeline (all stage/quote/won/lost activities carry `companyId`)
- [x] 2.5 Dashboard — single `GET /dashboard`: pipelineValue, activeDeals, winRate (90d), overdueTasks, dealsByStage, pipelineValueSeries (snapshots), topLossReasons, hotDeals, overdueTaskList. 10 parallel Prisma queries
- [x] All 8 modules registered in `app.module.ts` — 34 routes mapped
- [x] Demo owner user created: `aarav@forge.demo` / `ForgeOwner123!` (role: owner, attached to Lynky Forge Demo shop)
- [x] 64/64 end-to-end curl tests pass — `scripts/test-api-phase2.sh`
- [x] Phase 1 baseline regression: auth, shops/current, ask stub — all intact

## Bug found & fixed during testing

Stage-change / quote-sent / won / lost activities were missing `companyId` → Company 360 timeline missed them. Fixed by threading `companyId` through `StageChangeContext` and all activity creates. Also added `companyId` to auto-created follow-up tasks.

## Files created (26 new)

```
src/modules/automations/  module, service
src/modules/companies/    module, controller, contacts.controller, service, schemas
src/modules/deals/        module, controller, service, schemas
src/modules/rfqs/         module, controller, service, schemas
src/modules/quotes/       module, controller, service, schemas
src/modules/tasks/        module, controller, service, schemas
src/modules/activities/   module, controller, service, schemas
src/modules/dashboard/    module, controller, service
scripts/test-api-phase2.sh (64-assertion e2e suite)
```

## Files modified

- `src/app.module.ts` — 8 new module imports

## Decisions made (lock these)

- Quote totals computed server-side from line items via `decimal.js` — client totals never trusted
- Quote status SENT auto-advances early-stage deals (NEW_RFQ/CONTACTED) to QUOTE_SENT so the follow-up automation fires — one tx, no orphans
- Order numbering `ORD-YYYY-NNNN` mirrors quote numbering convention
- All CRM activities carry `companyId` so Company 360 timeline is complete
- Follow-up task idempotency window: 1 hour (same dealId + type + autoCreated)
- Test suite expects a clean DB (quoteNo assertions); wipe CRM tables before re-running

## Manual test (quick)

```bash
cd ~/lynky-forge/apps/api && node dist/src/main.js   # port 3001
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aarav@forge.demo","password":"ForgeOwner123!"}' | jq -r .accessToken)
curl -s http://localhost:3001/api/v1/dashboard -H "Authorization: Bearer $TOKEN" | jq
# Full suite: ~/lynky-forge/scripts/test-api-phase2.sh (64 assertions)
```

## Next session

- Phase 3 — Frontend shell (Next.js 15), Dashboard + Kanban (K3 for 3.5/3.6, MiMo for scaffold)
- Blockers to clear first: none
- Note: `pipelineValueSeries` is empty until Phase 6 seed populates `dashboard_snapshots`
