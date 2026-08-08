#!/bin/bash
set -e

# Root deps (for Next.js detection)
npm install

# Web deps
cd apps/web && npm install && cd ../..

# API deps + Prisma
cd apps/api
npm install --ignore-scripts
npx prisma generate
