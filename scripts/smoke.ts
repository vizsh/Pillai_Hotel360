import { getModel } from "@/lib/architecture/model";
import { seedState } from "@/lib/sim/seed";
import { tick, fmtClock } from "@/lib/sim/engine";
import { executeRecommendation } from "@/lib/sim/actions";
import { handleGuestMessage } from "@/lib/intelligence/concierge";

const model = getModel();
console.log("rooms", model.rooms.length, "assets", model.assets.length, "nav", model.nav.nodes.length, model.nav.edges.length);
for (const sc of ["peak-season", "equipment-crisis"] as const) {
  const s = seedState(model, 0x5a1f, sc);
  const t0 = performance.now();
  let accepted = 0;
  for (let i = 0; i < 3 * 24 * 30; i++) {
    tick(s, model, 2);
    if (i % 200 === 0) for (const r of Object.values(s.recommendations)) if (r.status === "pending") { executeRecommendation(s, model, r); accepted++; }
  }
  const ms = performance.now() - t0;
  const st = Object.values(s.staff);
  console.log(sc, fmtClock(s.t), `${ms.toFixed(0)}ms`, JSON.stringify({ occ: +s.kpis.occupancy.toFixed(3), adr: Math.round(s.kpis.adr), gss: +s.kpis.gss.toFixed(2), alerts: s.kpis.openAlerts, reqs: s.kpis.openRequests, reviews: s.reviews.length, feed: s.feed.length, recs: Object.keys(s.recommendations).length, accepted, moving: st.filter(x=>x.status==='moving').length, working: st.filter(x=>x.status==='working').length, failed: Object.values(s.assets).filter(a=>a.status==='failed').length, risk: Object.values(s.assets).map(a=>+a.failureProb7d.toFixed(2)).sort().slice(-3) }));
  console.log("  sample feed:", s.feed.slice(-4).map(f => f.text).join(" | "));
  const room = Object.values(s.rooms).find(r => r.guestId)!;
  const res = handleGuestMessage(s, model, room.id, "The AC is rattling and not cooling, please fix asap");
  console.log("  concierge:", res.classified.intent, res.classified.confidence.toFixed(2), res.classified.urgency, "->", s.requests[res.requestId!]?.assignedTo);
}
