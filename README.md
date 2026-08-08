# Lynky Forge

AI-powered CRM + Sales OS for contract manufacturers. Built for demo (August 9, 2026).

## Tech Stack

- **Frontend:** Next.js 16, Tailwind v4, React Query, dnd-kit, Recharts
- **Backend:** NestJS 10, Prisma 6, PostgreSQL (Neon)
- **AI:** Groq (Llama 3.3 70B) — quote drafting + Ask questions
- **Deploy:** Vercel (frontend + serverless API)

## Live

- Frontend: `https://lynky-forge.vercel.app`
- API: `https://lynky-forge.vercel.app/api/v1`

## Local Dev

```bash
# API (port 3001)
cd apps/api
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed:admin
npm run build
node dist/src/main.js

# Web (port 3000)
cd apps/web
npm install
npx next dev -p 3000
```

## Admin

- Email: `admin@forge.demo`
- Password: `DemoPass12345!`
- Shop: Lynky Forge Demo

## Demo Owner

- Email: `aarav@forge.demo`
- Password: `ForgeOwner123!`

## Environment Variables

```
DATABASE_URL=postgresql://...
JWT_SECRET=dev-secret-change-in-production
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
APP_ENV=production
CORS_ORIGINS=*
CRON_SECRET=...
```

## API Endpoints

All routes prefixed `/api/v1`. Auth = JWT Bearer.

| Method | Route | Purpose |
|--------|-------|---------|
| POST | /auth/login | Login |
| GET | /dashboard | Dashboard data |
| POST | /companies | Create company |
| GET | /companies | List companies |
| GET | /companies/:id | Company 360 |
| POST | /deals | Create deal |
| GET | /deals | List deals (paginated) |
| PATCH | /deals/:id/stage | Move deal stage |
| DELETE | /deals/:id | Delete deal |
| POST | /rfqs | Capture RFQ |
| GET | /rfqs | List RFQs |
| POST | /quotes | Create quote |
| POST | /quotes/draft | AI draft quote |
| POST | /quotes/draft-create | AI draft + create |
| GET | /quotes | List quotes |
| PATCH | /quotes/:id/status | Update quote status |
| PATCH | /quotes/:id/apply-draft | Apply AI draft |
| POST | /tasks | Create task |
| GET | /tasks | List tasks |
| PATCH | /tasks/:id/status | Update task status |
| GET | /ask/suggestions | Suggested questions |
| POST | /ask/query | Ask a question |
| POST | /cron/scan-overdue | Cron job |
