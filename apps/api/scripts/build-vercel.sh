#!/bin/bash
set -e

echo "🔧 Building API for Vercel..."

# 1. Install dependencies
npm install --ignore-scripts

# 2. Generate Prisma client
npx prisma generate

# 3. Compile TypeScript (preserves decorator metadata)
npx tsc -p tsconfig.build.json

# 4. Bundle compiled JS with esbuild
#    Externalize everything NestJS can optionally require + Prisma native binary
npx esbuild dist/src/main.js \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile=api/index.js \
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

# 5. Copy Prisma runtime files (needed at runtime)
mkdir -p api/node_modules/.prisma
mkdir -p api/node_modules/@prisma
cp -r node_modules/.prisma/* api/node_modules/.prisma/ 2>/dev/null || true
cp -r node_modules/@prisma/* api/node_modules/@prisma/ 2>/dev/null || true

echo "✅ Build complete"
echo "   Bundle: $(du -h api/index.js | cut -f1)"
echo "   Prisma: $(du -sh api/node_modules/.prisma 2>/dev/null | cut -f1)"
