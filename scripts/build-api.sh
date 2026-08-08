#!/bin/bash
set -e

# API: compile + bundle
cd apps/api
npx tsc -p tsconfig.build.json
npx esbuild dist/src/main.js \
  --bundle --platform=node --target=node20 --format=cjs \
  --outfile=../../api/index.js \
  --external:sharp \
  --external:"@prisma/client" \
  --external:".prisma/*" \
  --external:"@nestjs/websockets" \
  --external:"@nestjs/websockets/*" \
  --external:"@nestjs/microservices" \
  --external:"@nestjs/microservices/*" \
  --external:"class-transformer" \
  --external:"class-validator" \
  --external:"cache-manager" \
  --external:"@nestjs/cache-manager/*" \
  --external:"@nestjs/bull" \
  --external:"bull" \
  --minify

# Copy Prisma runtime
mkdir -p ../../api/node_modules/.prisma ../../api/node_modules/@prisma
cp -r node_modules/.prisma/* ../../api/node_modules/.prisma/
cp -r node_modules/@prisma/* ../../api/node_modules/@prisma/

echo "✅ API bundle: $(du -h ../../api/index.js | cut -f1)"
