import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  APP_ENV: z.string().default("local"),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGINS: z.string().default("*"),
  // Kimi AI (for draft quote + ask)
  KIMI_API_KEY: z.string().optional(),
  KIMI_MODEL: z.string().default("kimi-k3"),
  KIMI_BASE_URL: z.string().default("https://api.moonshot.cn/v1"),
  // Frontend URL (for CORS)
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:3000"),
  // Cron secret (for Vercel Cron endpoint)
  CRON_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
