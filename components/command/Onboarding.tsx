"use client";

import { useEffect } from "react";
import { Box, Layers3, Sparkles, BookOpen, Compass, X } from "lucide-react";
import { useOnboarding, ONBOARDING_STEPS } from "@/store/onboarding";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Five steps, meant to be read in under a minute — a judge has three, not thirty. Each
 * pairs one plain-English claim with the one keystroke/click that proves it, so this
 * doubles as a cheat-sheet even after someone stops reading closely. */
const steps: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <Box size={18} />,
    title: "This is a live digital twin, not a slideshow",
    body: "Every room, guest, and system you see is driven by a running simulation — check-ins, equipment wear, reviews, all of it ticking in real time. Nothing here is a static mockup.",
  },
  {
    icon: <Layers3 size={18} />,
    title: "Data layers project onto the building",
    body: "Occupancy, maintenance risk, sentiment, revenue — press Q W E R T Y, or pick one from the left rail, to swap what the twin's colors mean. Same building, different lens.",
  },
  {
    icon: <Sparkles size={18} />,
    title: "Recommendations are real actions, not suggestions",
    body: "Accept a card in the bottom dock and watch the twin react — a technician walks to a failing chiller, a guest gets relocated, a rate change ripples into RevPAR. This isn't cosmetic.",
  },
  {
    icon: <BookOpen size={18} />,
    title: "Every number says how real it is",
    body: "SIMULATED, MODELED, or DERIVED tags are clickable — they open the exact formula and, where one exists, the real industry benchmark it's calibrated against. Nothing is hidden math.",
  },
  {
    icon: <Compass size={18} />,
    title: "You can't break anything — go explore",
    body: "Press T for a cinematic flythrough, ⌘K to jump straight to a room, guest, or asset, or just drag to orbit. Replay this intro anytime from the compass icon in the top bar.",
  },
];

export function Onboarding() {
  const active = useOnboarding((s) => s.active);
  const step = useOnboarding((s) => s.step);
  const { next, prev, skip, maybeAutoStart } = useOnboarding();

  // Wait for the twin to actually finish generating before offering the intro — starting
  // it over the "GENERATING 130 ROOMS…" loading screen would stack two full-bleed overlays
  // and read as broken, not welcoming. subscribe() only fires on change, so also check the
  // current value directly in case twinReady flipped before this effect ran.
  useEffect(() => {
    if (useUi.getState().twinReady) {
      maybeAutoStart();
      return;
    }
    return useUi.subscribe(
      (s) => s.twinReady,
      (ready) => {
        if (ready) maybeAutoStart();
      },
    );
  }, [maybeAutoStart]);

  if (!active) return null;
  const s = steps[step];

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-void/70 backdrop-blur-sm" role="dialog" aria-label="Welcome">
      <div className="glass w-[480px] p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 text-accent">
            {s.icon}
            <span className="label">
              Step {step + 1} of {ONBOARDING_STEPS}
            </span>
          </div>
          <button onClick={skip} className="text-low hover:text-hi" aria-label="Skip intro">
            <X size={16} />
          </button>
        </div>

        <h2 className="mt-3 font-display text-[19px] font-semibold leading-snug">{s.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-mid">{s.body}</p>

        <div className="mt-5 flex items-center gap-1.5">
          {Array.from({ length: ONBOARDING_STEPS }).map((_, i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-accent" : "w-1.5 bg-white/15")} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={skip}>
            Skip intro
          </Button>
          <div className="flex items-center gap-1.5">
            {step > 0 && (
              <Button size="sm" variant="outline" onClick={prev}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={next}>
              {step === ONBOARDING_STEPS - 1 ? "Start exploring" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
