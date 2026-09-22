import { create } from "zustand";

const STORAGE_KEY = "resort360.onboarding.seen";

function hasSeenBefore(): boolean {
  if (typeof window === "undefined") return true; // never auto-start during SSR
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode) — harmless to show it again
  }
}

function markSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // storage unavailable — onboarding just replays next visit instead of staying
    // dismissed, which is a fine fallback, not worth surfacing an error for
  }
}

export const ONBOARDING_STEPS = 5;

interface OnboardingStore {
  active: boolean;
  step: number;
  /** Called once on the command center's first mount — auto-starts only if this browser
   * has never dismissed/finished it before. */
  maybeAutoStart: () => void;
  /** Explicit restart, e.g. from the TopBar "Replay intro" button. */
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
}

export const useOnboarding = create<OnboardingStore>((set, get) => ({
  active: false,
  step: 0,
  maybeAutoStart: () => {
    if (!hasSeenBefore()) set({ active: true, step: 0 });
  },
  start: () => set({ active: true, step: 0 }),
  next: () => {
    const { step } = get();
    if (step >= ONBOARDING_STEPS - 1) {
      markSeen();
      set({ active: false });
    } else set({ step: step + 1 });
  },
  prev: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  skip: () => {
    markSeen();
    set({ active: false });
  },
}));
