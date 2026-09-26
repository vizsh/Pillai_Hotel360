# Problems and Solutions — a real engineering log

This project's standing rule has been: reproduce the actual failure, find the real root cause, verify the fix live — never patch a symptom or guess at a threshold. This document is that log, kept because the *reasoning* behind a fix is often more valuable than the fix itself.

## The core PS risk: false positives from normal behaviour

Every design decision in this project's CCTV-adjacent work (and its sibling KINESIS AI hackathon submission for exam monitoring) treats false positives as the named, primary risk to defend against — not an afterthought. Two concrete instances below (the AI assistant hijacking ordinary questions, and the vision layer's persistence gating) are that same principle applied in this project's own two very different domains.

---

### Problem: the ops assistant gave confidently wrong, *identical* answers to different questions

**Symptom** (screenshot-verified): three different questions — one in English, two in Hindi — all returned the same wrong "23/22/21 rooms hold a VIP guest" answer.

**Root cause**, found by reproducing the exact sequence: a deterministic "show me" query matcher (`lib/twin/queries.ts`) had a bare keyword pattern (`vip` alone) that hijacked *any* message containing that word, in *any* language, before the message ever reached the LLM — and separately, once a conversation had gone through a Hindi exchange, the model itself would keep replying in Hindi even to a plain English follow-up, following the earlier turn's language rather than the current message's.

**Fix:** gated the keyword shortcut behind an explicit `LISTING_INTENT` verb regex (which/list/show/highlight/point/display...) and restricted it to English-only messages; made the system prompt state the target language explicitly on *every* request, "regardless of what language earlier messages in this conversation were in," rather than relying on the model to infer it from context.

**Also found in the same investigation:** raw high-precision floats (`0.8233020963248183`) were leaking straight into a Markdown table the model rendered for the user. Fixed at the tool boundary (`pct()`/`round2()` in `lib/ai/tools.ts`) rather than as a prompt instruction — a formatting bug is cheaper and more reliable to fix at the source than to ask a model to clean up after it.

---

### Problem: fire and altercation detection weren't firing on real footage at all

**Symptom:** the CCTV vision layer's fire and altercation heuristics never confirmed an alert on any of the provided test clips, despite clearly visible fire and a person in visible distress.

**Root cause, fire** — found by extracting real frames via `ffmpeg` and measuring actual pixel RGB values rather than guessing thresholds: a flame's brightest point is **overexposed to near-white** on camera (measured directly: R243/G229/B228, saturation 0.06), not the saturated orange the original hue-and-saturation test was looking for. The test was structurally blind to the brightest, most fire-like part of every frame.

**Root cause, altercation** — this project's own single real test clip shows **exactly one visible person** for its whole duration; a "≥2 people in contact" rule can never fire on it by design, and no amount of threshold tuning would fix that.

**Fix:** added a second pixel test for the white-hot flame core (calibrated against measured RGB values from four real clips, not assumed), and a second, independent "person down" signal based on bounding-box aspect ratio for the single-person case — itself calibrated by instrumenting live inference against the real clip (`console.log` of actual detected aspect ratios) rather than assuming a "wider than tall" rule, which measurement showed *never* held true even for a person collapsed against a wall.

---

### Problem: parking detected 0 vehicles in a lot with 5+ clearly visible cars

**Root cause:** COCO-SSD's default 0.5 confidence floor is implicitly tuned for street-level/frontal car views — an overhead lot camera is a genuinely harder, out-of-distribution angle for a detector never trained on aerial imagery. The real detections were happening internally at lower confidence and being discarded before ever reaching the page.

**Fix:** lowered the confidence floor to 0.15 for the parking category specifically (not globally — altercation's person detection kept a stricter floor, since that category doesn't have the same camera-angle problem), and the drawn label shows each box's real confidence honestly rather than hiding the lower number.

---

### Problem: a scenario's forced precondition wasn't enough to make it appear

**Symptom:** the VIP-preference Automation Scenario, even after forcing a guest's `sea-view` preference and confirming a vacant matching room existed, still reported "no live situation" most of the time.

**Root cause:** `personalizationRecommendations()` only ever publishes the resort-wide **top 3** scored guests — making an action merely *eligible* (score above its own 0.75 floor) isn't enough if other guests' unrelated actions (VIP arrival welcome, service recovery) currently score higher across the whole property.

**Fix:** the forced trigger now re-runs the real `nextBestActions()` scoring after nudging the guest's preference and checks whether that guest would actually land in the real top-3 scan before committing to that candidate — trying a few different guests rather than gambling on the first one, using the production ranking logic itself as the check rather than a proxy assumption.

---

### Problem: a live demo panel's readouts silently froze mid-run

**Symptom:** a scenario's live numeric readout (e.g. a fire's warm-pixel ratio) would stop updating partway through a run, with no visible error.

**Root cause:** the sampling loop was driven by `requestAnimationFrame`, which browsers throttle or fully pause in a backgrounded/non-visible tab — an environment-specific behavior of the testing harness, but worth hardening against regardless since a real presenter's browser tab focus can't be guaranteed either.

**Fix:** switched the sampling scheduler to `setInterval`, decoupled from paint frames entirely, with a busy-guard so a slow sample never overlaps the next tick, and error handling that logs-and-continues rather than silently halting the whole loop on one bad frame.

---

### Problem: two independently-deployed apps needed to "share data" with no shared database

**Constraint:** `near_home_360` (this app) and `guestexperience` (a separate guest-facing deployment) each have their own SQLite instance — guestexperience's is on Vercel's ephemeral serverless storage. Literal database file sharing isn't structurally possible.

**Resolution, stated honestly rather than papered over:** the real connection is HTTP, following the exact architecture already proven for the Telegram bot bridge (external caller → SQLite queue → browser-polling hook → real action functions) — not a fictional "shared DB." The registration QR's stay ID is drawn from guestexperience's own real public seed data specifically so a demo scan resolves to genuine data, rather than a placeholder that would only work if the other team also modified their app first.

---

### Problem: a stale dev-server cache made a syntactically-valid file appear broken

**Symptom:** after fixing a syntax error, the browser kept reporting the *same* old parse error on every reload, even after the dev server was restarted.

**Root cause:** a Turbopack Fast Refresh cache had wedged on the broken intermediate state; a client-side WebSocket reconnect was replaying the stale error from before the fix, not re-parsing the current file.

**Fix:** killed the orphaned process holding the port, cleared `.next`, and — critically — opened a genuinely fresh browser tab rather than reloading the same one, since the stale error was living in that tab's own retained client state, not the server.
