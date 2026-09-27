# API Catalog

Every external API and data source the system touches, what it is used for, and how it behaves when unreachable. Each row is a call the running code actually makes; the last column records what was observed on the development machine (reachability varies by network — which is exactly why every source carries its own status flag).

## External APIs and data sources

| API / provider | Access | Use case | Status / if unreachable |
|---|---|---|---|
| **Nugen Intelligence** (`api.nugen.in`) | Bearer API key | Document upload, benchmark generation, alignment, deployment and `/inference/chat/completions` for the aligned model — both assistants ([details](NUGEN_INTEGRATION.md)) | Fallback to Ollama on any error; provider shown on every answer |
| Open-Meteo Forecast | none | 7-day temperature and rain probability; drives the simulation, playbooks, what-if baseline and heat-linked AC wear | Live; cached 20 min; seeded forecast fallback |
| RainViewer weather-maps | none (browser) | Latest precipitation-radar frame on the regional map | Best-effort; base map stays |
| OpenStreetMap tiles | none | Base map tiles | Live |
| GDACS (UN / EC) | none | Open cyclone, flood, drought, wildfire, earthquake events (30 days) at real coordinates; weight 2× in the concern score | Reachable |
| NewsAPI.org | key (env) | Regional weather-hazard articles | Reachable |
| GNews | key (env) | Second, independent news source | Reachable |
| Reddit public search | none | Regional monsoon / flooding posts | May be blocked on some networks — reported unreachable |
| Bluesky public search | none | Public posts on regional rain | May be bot-blocked (403) — reported unreachable |
| Mastodon `#goa` timeline | none | Posts filtered to weather-relevant content | Reachable |
| Google Trends (unofficial) | none | Search-interest reading | Best-effort |
| Telegram Bot API | bot token | Staff tasks and issue reports via long-polling (no public webhook) | Opt-in standalone process |
| Ollama local REST | none, localhost | Fallback chat (`llama3.1:8b`) and embeddings (`nomic-embed-text`) for RAG | Opt-in; deterministic answers work when off |
| TensorFlow.js COCO-SSD weights | none | Pretrained person/vehicle detector, downloaded once, run in the browser | Frames never leave the browser |
| Web Speech API | browser | Voice in/out (English, Hindi, Marathi) | Text-only fallback |

## Internal routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/weather` | GET | Cached Open-Meteo proxy |
| `/api/social-weather-signals` | GET | Fans out to the seven public sources; items, hazards, trend score, per-source flags |
| `/api/guest-app/inbox` | POST · GET · PATCH | Bridge: the guest app submits, the admin browser drains and acknowledges |
| `/api/telegram/inbox` | GET · POST | Queue between the Telegram bot and the live simulation (exactly-once apply) |
| `/api/ops-assistant` · `/api/concierge` | GET · POST | Assistants: composers → Nugen-aligned model → Ollama fallback; GET reports the provider |
| `/api/auth/login` · `logout` · `session` | POST · POST · GET | Salted-hash sign-in and server-verified role |
| `/api/actions` · `/api/snapshots` | GET · POST | SQLite audit log and state snapshots |

Design rule: **every external source is failure-isolated** — a blocked API degrades one badge, never the feature.
