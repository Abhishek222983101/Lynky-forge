"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { setSession, type AuthUserInfo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  user: AuthUserInfo;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("aarav@forge.demo");
  const [password, setPassword] = useState("ForgeOwner123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", { email, password });
      setSession(res.accessToken, res.user);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Wrong email or password.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-ink">
            <span className="font-display text-xl font-bold text-signal">F</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Lynky Forge</h1>
          <p className="mt-1.5 text-sm text-steel">CRM for manufacturers who never drop a quote.</p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? (
              <p role="alert" className="rounded-lg bg-hazard-soft px-3 py-2 text-[13px] font-medium text-hazard">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} className="mt-1 w-full">
              Log in
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-steel">
          Lynky AI · Forge
        </p>
      </div>
    </div>
  );
}
