/** Curated, static knowledge about how Smart Resort 360 itself works — what each module does, the
 * exact formula behind it, and every external API it integrates. Distinct from the live
 * snapshot (what is happening on the property right now): this answers "how does it work / why /
 * which API / what is the math" questions a reviewer asks about the system. Retrieval is plain
 * keyword scoring, deterministic and offline, so a tool call never depends on an embedding model. */
export interface SystemFact {
  id: string;
  title: string;
  keywords: string[];
  text: string;
}

export const SYSTEM_KNOWLEDGE: SystemFact[] = [
  { id: "overview", title: "What Smart Resort 360 is", keywords: ["what", "overview", "system", "platform", "smart resort", "about", "purpose", "digital twin"],
    text: "Smart Resort 360 is a real-time AI operations platform for hospitality built on one shared, explainable 3D digital twin of the property. Twelve decision modules and three composite views read from and write to the same simulation state; every recommendation carries the measured inputs that produced it, and accepting one dispatches a real consequence visible on the twin. Values are tagged real, modeled or simulated." },
  { id: "modules", title: "The twelve decision modules", keywords: ["modules", "twelve", "12", "list", "features", "capabilities"],
    text: "1 Predictive Maintenance (Weibull hazard + telemetry anomaly), 2 Dynamic Pricing (constant-elasticity demand curve), 3 Intelligent Staffing (demand forecast + greedy roster solve), 4 Inventory Optimization (Holt forecast, safety stock, EOQ), 5 Sentiment Analysis (aspect lexicon), 6 Guest Segmentation (k-means, k=5), 7 Guest Personalization (next-best-action), 8 AI Concierge (intent classifier), 9 Guest Impact & Relocation, 10 Energy Intelligence, 11 Group Block Optimizer, 12 In-Stay Guest Recovery. Plus composite views: Causal Chain, Demand Spine (14-day forecast), Guest Experience Index." },
  { id: "maintenance-math", title: "Predictive maintenance math", keywords: ["maintenance", "weibull", "hazard", "failure", "predictive", "chiller", "asset", "probability", "7 day", "rul"],
    text: "Effective runtime = runtime hours / max(0.15, health). Weibull cumulative hazard H(t) = (t/lambda)^k with per-asset-type shape k and scale lambda. 7-day base hazard = 1 - exp(-(H(t+7d) - H(t))). Anomaly z = 0.5*max(0, temperature z) + 0.5*max(0, vibration z). P(fail within 7 days) = 1 - (1 - base hazard) * exp(-0.45 * anomaly). A recommendation fires only when P crosses 35%. Industry benchmark: reactive maintenance costs 3-5x planned maintenance." },
  { id: "pricing-math", title: "Dynamic pricing math", keywords: ["pricing", "price", "rate", "revpar", "elasticity", "adr", "demand curve", "multiplier", "revenue management"],
    text: "demand(m) = base demand * m^(-elasticity) * seasonality * pacing; RevPAR(m) = ADR(m) * occupancy(m). A grid search over candidate rate multipliers finds the RevPAR-maximising point; a recommendation fires only if the optimum differs from the live rate by more than 4%. Elasticity is blended from the guest mix (segments differ), so the curve says whether the right move is 2%, 5% or 8%, unlike a fixed rules table." },
  { id: "kpi-definitions", title: "Revenue KPI definitions", keywords: ["kpi", "adr", "revpar", "trevpar", "occupancy", "definition", "formula", "revenue", "direct booking", "ota", "commission"],
    text: "Occupancy = occupied rooms / available rooms. ADR = room revenue / occupied rooms. RevPAR = ADR * occupancy = room revenue / available rooms. TRevPAR = total revenue (rooms + F&B + spa + other) / available rooms. Direct-booking share is revenue-weighted. OTA commission avoided = direct-booked revenue * 20% blended OTA commission (an estimate against a counterfactual, not a ledger line)." },
  { id: "staffing", title: "Staffing and burnout", keywords: ["staffing", "roster", "staff", "burnout", "fatigue", "housekeeping", "shift", "fairness", "overtime"],
    text: "Hourly demand per department is forecast from occupancy and service-time constants, solved by greedy allocation (largest gaps first) plus a pairwise-swap improvement pass. A call-in is recommended only when the solver cannot close the gap by rebalancing existing staff. A separate fatigue model tracks per-attendant load and escalates only on a multi-person pattern. Roster fairness scoring and walking-distance room assignment are included." },
  { id: "inventory", title: "Inventory optimization", keywords: ["inventory", "reorder", "stock", "eoq", "safety stock", "holt", "supplies"],
    text: "Holt level: level_t = a*y_t + (1-a)(level_(t-1) + trend_(t-1)). Safety stock ~ 1.65 * sigma * sqrt(lead-time days) (about 95% service level). Reorder point = forecast demand over lead time + safety stock. EOQ = sqrt(2 * annual demand * order cost / holding cost). A reorder fires when projected on-hand stock crosses the reorder point before the next delivery." },
  { id: "sentiment", title: "Sentiment and guest recovery", keywords: ["sentiment", "review", "complaint", "recovery", "unhappy", "silent", "churn", "satisfaction", "nps", "gss"],
    text: "Reviews are split into clauses, scored against a weighted aspect lexicon (room, wifi, food, staff, cleanliness, noise, value) with negation handling. A root-cause link needs at least 3 independent reviews on the same aspect with mean below -0.2. In-Stay Guest Recovery combines sentiment with SLA-breach density inside the pre-checkout window to catch guests who never complain; the recovery gesture scales with guest value and issue severity." },
  { id: "segmentation-personalization", title: "Segmentation and personalization", keywords: ["segment", "segmentation", "kmeans", "k-means", "personalization", "next best action", "nba", "upsell", "loyalty", "consent"],
    text: "k-means (k=5, k-means++ initialisation) over six min-max-normalised features: spend per night, nights, lead time, party size, spa engagement, sentiment; below 5 in-house guests no clusters are returned. Personalization scores each candidate action 0-1 from preference match, stay stage, sentiment, loyalty and whether the offer is fulfilable right now; only consenting guests are profiled." },
  { id: "energy", title: "Energy intelligence", keywords: ["energy", "hvac", "eco", "waste", "power", "saving", "ac", "vacant"],
    text: "Flags rooms that are vacant but still conditioned at the occupied setpoint. The gate is binary on occupancy, so an occupied room's comfort is never touched to save energy. HVAC is typically the largest single share of hotel energy spend (benchmark); modeled improvement 8-18% of HVAC waste." },
  { id: "group-blocks", title: "Group block optimizer", keywords: ["group", "block", "displacement", "event", "conference", "wedding"],
    text: "Displacement per room = transient ADR at current occupancy - group contracted ADR. Fires only above a minimum group-room count and occupancy so the group provably displaces sellable transient demand." },
  { id: "weather-twin", title: "Weather-driven digital twin", keywords: ["weather", "twin", "rain", "heatwave", "storm", "forecast", "monsoon", "cyclone", "weather twin"],
    text: "The live forecast (Open-Meteo, seeded fallback) is read by the simulation tick: rain shifts organic F&B spend up, cuts pool-deck and sky-bar demand, changes the indoor/outdoor request mix and raises daytime in-room presence, which cascades into the eco-mode energy logic. One shared weather-demand profile feeds the tick, the what-if projection and the impact map. Rain severity = max(0.2, rain probability); F&B spend x (1 + 0.35*severity); in-room presence +0.28*severity; pool-deck demand x (1 - 0.55*severity); restaurant demand x (1 + 0.30*severity). Heatwave severity = clamp((temp - 34)/6, 0.3, 1)." },
  { id: "weather-whatif", title: "Monte Carlo weather what-if", keywords: ["what-if", "what if", "whatif", "monte carlo", "scenario", "simulate", "counterfactual", "percentile", "p10", "p90", "uncertainty"],
    text: "The what-if clones the live state and fast-forwards the real simulation tick over an 8-hour horizon in 30-minute steps, once under the chosen weather and once under an otherwise identical clear day, across 6 paired random seeds. Reported band = P10/P50/P90 of (scenario - clear) for occupancy, F&B demand, room energy, unmet staffing, HVAC risk and open F&B/concierge requests. Paired seeds isolate the causal effect of the weather. Limits: 6 runs give a coarse band, and the live state is never mutated." },
  { id: "social-signals", title: "Public social and hazard signals", keywords: ["social", "signal", "news", "reddit", "bluesky", "mastodon", "gnews", "newsapi", "trends", "concern", "public", "hazard", "gdacs"],
    text: "Seven public sources are fetched server-side behind Promise.allSettled: NewsAPI, GNews, Reddit, Bluesky, Mastodon (#goa filtered to weather), GDACS hazard events and Google Trends. Concern score = (keyword share*1 + hazard*2 + trend*1) / sum of the weights actually present; hazard = 1 if any open regional GDACS event; readings older than 3 hours are ignored. It nudges the simulation: concierge request bias -0.06*concern, complaint bias +0.04*concern. It is a coarse keyword-and-hazard blend, not a trained classifier, and each source is badged live or unreachable individually." },
  { id: "regional-map", title: "Regional weather map", keywords: ["map", "regional", "radar", "leaflet", "geospatial", "rainviewer", "openstreetmap", "airport", "beach"],
    text: "A Leaflet map with an OpenStreetMap base, RainViewer live precipitation radar (capped at native zoom 7), GDACS hazard events at their reported coordinates, Goa's airports, Panjim and beaches, and an animated impact ripple paced by the current weather condition. Distinct from the property-zone impact map." },
  { id: "cctv", title: "CCTV vision layer", keywords: ["cctv", "camera", "surveillance", "fire", "smoke", "altercation", "fight", "parking", "vision", "coco", "detection", "distress"],
    text: "Fire: a per-scene adaptive baseline (first ~5.6 s calibrate that camera's normal warmth) plus corroborating frame-to-frame flicker, persistence-gated. Altercation: person-detection box overlap and inter-frame motion plus a bounding-box aspect 'person down' signal. Parking: real vehicle detection (COCO-SSD lite_mobilenet_v2, in-browser via TensorFlow.js) binned into a zone occupancy grid. A confirmed incident triggers an automated emergency response that dispatches staff. Frames never leave the browser; thresholds were calibrated on real footage, not a trained fire classifier." },
  { id: "automation", title: "Autopilot and Automation Scenarios", keywords: ["autopilot", "automation", "scenario", "automatic", "auto", "dispatch", "approve"],
    text: "Autopilot counts down every pending recommendation visibly and then calls the exact same accept function a manual click would, so a human can always intervene and every action is logged. Automation Scenarios is a curated catalogue narrating detect, decide, dispatch, staff walk, resolved for all twelve modules plus live chat and the guest-app bridge." },
  { id: "guest-bridge", title: "Guest-app bridge", keywords: ["guest app", "bridge", "qr", "companion", "guestexperience", "order", "room service", "inbox"],
    text: "A guest scans a QR generated from a real (room, stay-ID, guest) triple and lands on their personalised page in the separate guest-facing app. Orders POST to /api/guest-app/inbox; this system polls every 5 seconds, translates the request into internal types, dispatches a real staff member, and lists it in the live Guest Requests view on the Integrations page. Two-way and verified end-to-end. The apps keep separate guest rosters, so a bridged order carries the guest app's own guest name." },
  { id: "telegram", title: "Telegram frontline bot", keywords: ["telegram", "bot", "staff phone", "frontline", "whatsapp"],
    text: "A standalone process using Telegram's Bot API (long-polling getUpdates, no public webhook) so staff receive tasks and report issues from their phones. It writes to a SQLite queue; the browser drains it via /api/telegram/inbox so each action applies exactly once. Telegram was chosen over WhatsApp because WhatsApp Business needs Meta verification." },
  { id: "apis", title: "External APIs integrated", keywords: ["api", "apis", "integration", "integrations", "external", "third party", "data source", "endpoint", "which apis"],
    text: "Open-Meteo (7-day forecast, no key, 20-min cache) drives weather; RainViewer (radar tiles) and OpenStreetMap (base tiles) draw the regional map; GDACS (UN/EC hazard events); NewsAPI and GNews (keyed news); Reddit, Bluesky, Mastodon (public social); Google Trends (unofficial search-interest); Telegram Bot API (staff bot); Ollama local REST (llama3.1:8b chat, nomic-embed-text embeddings); TensorFlow.js COCO-SSD weights (one-time download); Web Speech API (browser voice). Internal routes: /api/weather, /api/social-weather-signals, /api/guest-app/inbox, /api/telegram/inbox, /api/concierge, /api/ops-assistant, /api/auth/*, /api/actions, /api/snapshots." },
  { id: "ai-stack", title: "AI and LLM stack", keywords: ["ai", "llm", "ollama", "llama", "model", "rag", "assistant", "chatbot", "concierge", "local", "privacy", "nugen", "aligned"],
    text: "The ops assistant is a tool-calling LLM: it picks tools that read the live snapshot (rooms, guests, issues, KPIs, weather, signals, assets, financials) and a calculator, so every number comes from a tool, never from the model's memory. The guest concierge is RAG-grounded (embeddings over the resort knowledge base) layered on a deterministic intent classifier that owns all task dispatch. Ollama runs locally with no API key and no outbound call beyond localhost. Guardrails block promises of refunds or compensation." },
  { id: "rbac-auth", title: "Auth and RBAC", keywords: ["auth", "login", "role", "rbac", "password", "session", "security", "access", "permission"],
    text: "Four roles (General Manager, Revenue Manager, Front Office Manager, Executive Housekeeper), salted scrypt password hashes, an HMAC-SHA256 signed httpOnly session cookie (8 h) and middleware that redirects unauthenticated page requests to /login. Guest spend is masked for roles without value access and for guests who have not consented. RBAC is a duties guardrail, not a data-secrecy boundary, since the simulation lives in the browser." },
  { id: "persistence", title: "Persistence and audit", keywords: ["database", "sqlite", "audit", "log", "snapshot", "persistence", "history", "storage"],
    text: "Node's built-in node:sqlite backs the audit log (every accepted or dismissed recommendation, timestamped and attributable), state snapshots for restore, and the Telegram and guest-app inbox queues." },
  { id: "business-impact", title: "Business impact (modeled)", keywords: ["impact", "roi", "savings", "benefit", "business", "cost", "reduction", "value", "benchmark", "improvement"],
    text: "Modeled from the system's own logic, not measured on a live property: RevPAR +4-9% from dynamic pricing; unplanned-failure cost -20-40% (reactive is 3-5x planned); HVAC waste -8-18%; housekeeping overtime and SLA breaches -10-25%; 15-35% of at-risk stays recovered before checkout. Size it by applying the percentage to a property's own spend, not by copying the number." },
  { id: "honesty", title: "Real vs modeled vs simulated", keywords: ["real", "simulated", "modeled", "honest", "fake", "mock", "limitation", "limits", "scope", "not real"],
    text: "Real: running code verified live (twin, module math, CCTV detection, live weather, weather what-if, regional map, public feeds per source, Telegram bot, two-way guest bridge, RBAC). Modeled: a real formula on current simulated state (hazard %, next-best-action score, what-if band). Simulated: the property, guests, staff and telemetry come from a seeded deterministic engine. PMS/BMS/camera-analytics are proven as payload contracts only." },
  { id: "deployment", title: "Tech stack", keywords: ["stack", "tech", "technology", "framework", "next.js", "react", "three", "zustand", "built with", "architecture"],
    text: "Next.js 16 App Router + React 19; React Three Fiber / three.js procedural 3D twin; Zustand for the 10 Hz simulation state read inside the render loop; SQLite persistence; Leaflet for maps; TensorFlow.js COCO-SSD for browser vision; Ollama for local LLM; Recharts for charts." },
];

const STOP = new Set(["the", "a", "an", "is", "are", "of", "to", "how", "what", "does", "do", "in", "on", "for", "and", "or", "it", "this", "that", "with", "you", "we", "our", "your", "me", "my", "about", "can", "which", "why"]);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9+\-\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Deterministic relevance ranking: keyword hits weigh most, then body-text token overlap. */
export function searchKnowledge(query: string, limit = 3): SystemFact[] {
  const q = query.toLowerCase();
  const qt = tokens(query);
  const scored = SYSTEM_KNOWLEDGE.map((f) => {
    let score = 0;
    for (const k of f.keywords) if (q.includes(k)) score += k.includes(" ") ? 4 : 3;
    const body = f.text.toLowerCase() + " " + f.title.toLowerCase();
    for (const t of qt) if (body.includes(t)) score += 1;
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.f);
}
