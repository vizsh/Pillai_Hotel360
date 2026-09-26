# What Actually Differentiates This Project

A hackathon judge sees a lot of dashboards with plausible-looking numbers. Here's what to actually check for, and where in this project it's demonstrated.

## 1. Every number explains itself from real features — never a bare confidence score

Click "basis" on any recommendation card, anywhere in the app, and you get the actual measured inputs (`runtime 41,200h · Weibull k=2.4 λ=26,000h`, `24% warm-pixel coverage, flicker variance 0.0031`) — not "confidence: 87%." This is enforced structurally: `Recommendation.basis: string[]` is a required field built at the source, and the CCTV vision layer (added later, under real time pressure) held the exact same bar rather than taking the shortcut of a fabricated score. See [`INTELLIGENCE_MODELS.md`](INTELLIGENCE_MODELS.md) and [`SURVEILLANCE.md`](SURVEILLANCE.md).

## 2. Real detection over real footage, not staged screenshots

The CCTV layer runs an actual pretrained object detector (COCO-SSD via TensorFlow.js) and actual pixel-level heuristics over the videos you supplied — click Run detection and watch it happen, live, with bounding boxes drawn on the real frames. When it didn't work at first, the fix was found by extracting real frames with `ffmpeg` and measuring actual RGB values — not by adjusting a slider until a demo looked right. That process is documented in [`PROBLEMS_AND_SOLUTIONS.md`](PROBLEMS_AND_SOLUTIONS.md).

## 3. A persistence gate everywhere a signal could be noisy

Every anomaly-driven module — predictive maintenance's telemetry anomaly, the sentiment module's root-cause linking (requires 3 independent reviews, not 1), the CCTV layer's fire/altercation detectors — requires the signal to be *sustained*, not a single reading, before it becomes an alert. This is the single most repeated architectural decision in the codebase, because it's the single most important one for a system whose stated risk #1 is false positives.

## 4. Autopilot and Automation Scenarios execute for real, not a scripted sequence

Toggling Autopilot calls the *exact same* `acceptRecommendation()` function a manual click uses — the demo mode is a countdown removed from real code, not a fake animation. Automation Scenarios goes further: pick "HVAC unit fails mid-stay" and watch a *real* asset get marked failed, a *real* staff member get dispatched with a *real* computed path, and a *real* relocation recommendation execute — narrated step by step, not jump-cut from "start" to "done." See [`AUTOMATION_AND_INTEGRATIONS.md`](AUTOMATION_AND_INTEGRATIONS.md).

## 5. The "what's real vs. simulated" boundary is never blurred

Every value on screen is tagged `SIMULATED`, `MODELED`, or `DERIVED`. Weather is real and live (Open-Meteo) — and the UI says so, distinctly from the seeded fallback, rather than presenting both identically. The Integrations page doesn't claim a PMS/BMS/camera-analytics connection exists — it proves the payload *contract* is satisfiable by generating live JSON from current state, and says plainly what's built today vs. what a real ingestion service would add.

## 6. Two independently-built systems, bridged honestly

The guestexperience guest app and this staff-facing system are separate deployments with separate databases — the bridge between them (`app/api/guest-app/inbox`) is real, tested, and verified end-to-end live, but the README and this doc set both say clearly that the *other* app doesn't call it yet. Nothing is presented as "already connected" when it's actually "connected and provably ready to receive."

## 7. Privacy design carried through by default, not bolted on

No face recognition anywhere, including the CCTV layer — every vision detection is an anonymized bounding box and an aggregate count. This mirrors the same non-negotiable design principle from this project's own sibling hackathon submission (KINESIS AI, real-time exam monitoring) applied here without being asked twice.

## 8. Every fix in this codebase is verified live, not just "should work now"

`tsc --noEmit`, the full Vitest suite, `eslint`, and `npm run build` are run after every change — but more importantly, every user-facing feature in this project has been driven through an actual browser (screenshots, console inspection, live state reads) before being called done, including deliberately reproducing a bug first to confirm the *actual* root cause rather than the first plausible one. See [`PROBLEMS_AND_SOLUTIONS.md`](PROBLEMS_AND_SOLUTIONS.md) for the log of exactly that process.
