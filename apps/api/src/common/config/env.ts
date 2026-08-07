import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  GOLD_RATE_PROVIDER: z.string().optional(),
  GOLD_RATE_API_KEY: z.string().optional(),
  GOLD_RATE_API_URL: z.string().default("http://localhost:4000"),
  GOLD_RATE_STATIC_22K: z.string().optional(),
  GOLD_RATE_STATIC_24K: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_STT_MODEL: z.string().default("saaras:v3"),
  SARVAM_STT_MODE: z.string().default("transcribe"),
  SARVAM_STT_LANGUAGE_CODE: z.string().default("unknown"),
  SARVAM_CHAT_MODEL: z.string().default("sarvam-105b"),
  SARVAM_TTS_MODEL: z.string().default("bulbul:v2"),
  SARVAM_TTS_SPEAKER: z.string().default("anushka"),
  SARVAM_TTS_LANGUAGE_CODE: z.string().default("en-IN"),
  VOICE_INTENT_PROVIDER: z.enum(["deterministic", "sarvam"]).default("deterministic"),
  // One Google key, shared by Live voice and Content Studio image generation.
  GEMINI_API_KEY: z.string().optional(),
  // 3.1-flash-live measured ~1.2s to first spoken word vs ~1.5s for
  // 2.5-native-audio (and ~2.3-4.1s before thinkingLevel/VAD tuning).
  GEMINI_LIVE_MODEL: z.string().default("models/gemini-3.1-flash-live-preview"),
  // M4 Content Studio (all optional; safe stubs when unset)
  CONTENT_ORCHESTRATOR_PROVIDER: z.enum(["deterministic", "sarvam"]).default("deterministic"),
  CONTENT_IMAGE_PROVIDER: z.enum(["stub", "gemini", "openrouter"]).default("stub"),
  CONTENT_VIDEO_PROVIDER: z.enum(["stub", "veo3"]).default("stub"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),
  // OpenRouter image generation (Nano Banana / Gemini 2.5 Flash Image). Optional;
  // used only when CONTENT_IMAGE_PROVIDER=openrouter. No secrets in code.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_IMAGE_MODEL: z.string().default("google/gemini-2.5-flash-image"),
  // Meta (Instagram/Facebook) OAuth. One developer app for the whole SaaS; each
  // shop OAuths its own handles. App secret is a server secret (never shipped).
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  // Facebook Login for Business uses a Configuration (config_id) instead of a raw
  // scope list. If set, the OAuth dialog uses it; otherwise we fall back to scopes.
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  META_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/api/v1/content/social/meta/callback"),
  // Where to send the browser back after OAuth completes.
  WEB_APP_URL: z.string().default("http://localhost:5173"),
  VEO_API_KEY: z.string().optional(),
  VEO_MODEL: z.string().default("veo-3.0-generate-preview"),
  CONTENT_ASSET_BASE_URL: z.string().default("https://assets.sornam.local/content"),
  // Public base URL the API is reachable at, used to build image URLs the app
  // and social platforms can fetch. For real publishing this must be internet-
  // reachable (a deployment or a tunnel), not localhost. Ignored when Cloudinary
  // is configured (images then live on the Cloudinary CDN).
  MEDIA_BASE_URL: z.string().default("http://localhost:3000"),
  // Cloudinary image CDN (production image hosting). When all three are set,
  // generated images upload here and their public https URL is used everywhere,
  // so no tunnel is needed. Get these from the Cloudinary dashboard.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  APP_ENV: z.string().default("local"),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGINS: z.string().default("*")
});

export const env = envSchema.parse(process.env);
