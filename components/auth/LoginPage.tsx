"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Lock, ShieldCheck } from "lucide-react";
import { ROLES, roleList, type Role } from "@/lib/rbac";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** One demo account per RBAC role — the actual passwords live server-side (lib/db/client.ts
 * seeds them hashed); this is just enough to label the one-click cards below and to
 * pre-fill the form so a live demo never involves typing a password on stage. Real auth
 * still runs underneath: these buttons call the same /api/auth/login endpoint the typed-out
 * form does, with the same credentials any of the 4 seeded accounts actually has. */
const DEMO_CREDENTIALS: Record<Role, { username: string; password: string }> = {
  gm: { username: "gm", password: "resort360" },
  "revenue-manager": { username: "revenue", password: "resort360" },
  "front-office-manager": { username: "frontoffice", password: "resort360" },
  "executive-housekeeper": { username: "housekeeping", password: "resort360" },
};

export function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/command";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function login(u: string, p: string, key: string) {
    setError(null);
    setLoading(key);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        setError("Invalid username or password.");
        setLoading(null);
        return;
      }
      router.push(from);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — is the app running?");
      setLoading(null);
    }
  }

  return (
    <div className="flex h-full min-h-screen w-full items-center justify-center bg-void px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Box size={20} />
          </div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-hi">Smart Resort 360</h1>
          <p className="text-[12.5px] text-mid">Sign in to Azure Bay Resort&apos;s operations console</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login(username, password, "form");
          }}
          className="mb-5 flex flex-col gap-3 rounded-xl border border-stroke bg-deep/70 p-5"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-low">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-9 rounded-md border border-stroke bg-transparent px-3 text-[12.5px] text-hi outline-none focus:border-accent/60"
              autoComplete="username"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-low">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 rounded-md border border-stroke bg-transparent px-3 text-[12.5px] text-hi outline-none focus:border-accent/60"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-[11.5px] text-critical">{error}</p>}
          <Button type="submit" variant="primary" disabled={loading !== null} className="mt-1 justify-center">
            <Lock size={12} /> {loading === "form" ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="flex items-center gap-2 py-1 text-[10.5px] text-low">
          <span className="h-px flex-1 bg-stroke" />
          <span className="flex items-center gap-1">
            <ShieldCheck size={11} /> demo accounts — one per role
          </span>
          <span className="h-px flex-1 bg-stroke" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {roleList.map((r) => (
            <button
              key={r}
              disabled={loading !== null}
              onClick={() => void login(DEMO_CREDENTIALS[r].username, DEMO_CREDENTIALS[r].password, r)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border border-stroke bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/5 disabled:opacity-50",
              )}
            >
              <span className="text-[12px] text-hi">{ROLES[r].label}</span>
              <span className="text-[10px] text-low">{loading === r ? "Signing in…" : `Continue as ${ROLES[r].label}`}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
