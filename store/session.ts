import { create } from "zustand";
import type { Role } from "@/lib/rbac";

interface SessionUser {
  name: string;
  role: Role;
  username: string;
}

interface SessionStore {
  role: Role;
  user: SessionUser | null;
  /** true once the initial /api/auth/session fetch has resolved — lets AnalyticsShell tell
   * "still checking" apart from "checked, and there's no session" without an extra effect. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

/** role defaults to "gm" only so every existing read of useSession().role before hydration
 * resolves has a valid value to render against — middleware.ts is what actually keeps a
 * logged-out visitor off these pages at all, this default is never a real grant. Real role
 * always comes from hydrate(), which reads the server-verified session
 * (app/api/auth/session), never from a client-settable field — the free role-switcher this
 * store used to expose is gone; see components/auth/LoginPage.tsx for how a role is now
 * actually assigned. */
export const useSession = create<SessionStore>()((set) => ({
  role: "gm",
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; user: SessionUser | null };
      if (data.ok && data.user) set({ role: data.user.role, user: data.user, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
  },
}));
