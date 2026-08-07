import { Queue } from "bullmq";
import { env } from "@/common/config/env";

function redisConnection(url: string, maxRetriesPerRequest?: number | null) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1) || 0) : 0,
    maxRetriesPerRequest,
  };
}

export const queueConnection = redisConnection(env.REDIS_URL);
export const workerConnection = redisConnection(env.REDIS_URL, null);
export const invoiceQueue = new Queue("invoice", { connection: queueConnection });
export const voiceQueue = new Queue("voice", { connection: queueConnection });
export const contentQueue = new Queue("content", { connection: queueConnection });
