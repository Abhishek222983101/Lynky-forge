import { clearSession, getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const PREFIX = "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  // ZodValidationPipe: { detail: "Validation failed", issues: [{message, path}] }
  if ("issues" in body) {
    const issues = (body as { issues: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { message?: unknown };
      if (typeof first?.message === "string") return first.message;
    }
  }
  // AppError: { detail: "human message" } · NestJS: { message: string | string[] }
  const msg = (body as { detail?: unknown; message?: unknown }).detail ?? (body as { message?: unknown }).message;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg) && msg.length > 0) return String(msg[0]);
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${PREFIX}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Cannot reach the Forge API. Check your connection and try again.", 0);
  }

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError("Your session expired. Log in again.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(extractMessage(body, `Request failed (${res.status})`), res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
