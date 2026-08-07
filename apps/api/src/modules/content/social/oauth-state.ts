// Stateless, signed OAuth `state` so the Meta callback (a public browser
// redirect with no auth header) can be tied back to the shop/user that started
// it. HMAC-signed with JWT_SECRET; short TTL. No DB/session needed.

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/common/config/env";

interface StatePayload {
  shopId: string;
  userId: string;
  exp: number; // epoch ms
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(payloadB64).digest("base64url");
}

export function encodeState(shopId: string, userId: string, ttlMs = 10 * 60 * 1000): string {
  const payload: StatePayload = { shopId, userId, exp: Date.now() + ttlMs };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeState(state: string): StatePayload | null {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as StatePayload;
    if (!payload.shopId || !payload.userId || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
