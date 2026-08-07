-- Per-shop social publishing config (Buffer access token + connected profiles).
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "social_config" JSONB;
