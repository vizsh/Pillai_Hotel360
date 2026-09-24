import { create } from "zustand";
import type { Role } from "@/lib/rbac";

interface SessionStore {
  role: Role;
  setRole: (role: Role) => void;
}

export const useSession = create<SessionStore>()((set) => ({
  role: "gm",
  setRole: (role) => set({ role }),
}));
