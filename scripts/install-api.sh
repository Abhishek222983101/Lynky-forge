#!/bin/bash
set -e

# Web deps (Vercel auto-detects Next.js but we need installCommand override)
cd apps/web && npm install && cd ../..

# API deps + Prisma
cd apps/api
npm install --ignore-scripts
npx prisma generate
