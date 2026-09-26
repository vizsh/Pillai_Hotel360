import type { ResortModel } from "@/lib/architecture/types";
import type { RequestType, SimState } from "@/lib/sim/types";
import { createRequest, dispatchStaff, pushFeed } from "@/lib/sim/engine";
import { requestTemplates } from "@/lib/sim/text";

export type Intent = RequestType | "info" | "smalltalk" | "unknown";

const intents: Record<Intent, { keywords: [string, number][]; dept: string; sla: number }> = {
  housekeeping: { keywords: [["towel", 2], ["pillow", 2], ["clean", 2], ["bin", 1], ["linen", 2], ["sheets", 2], ["housekeeping", 3], ["turndown", 3], ["minibar", 1], ["restock", 2], ["laundry", 2]], dept: "housekeeping", sla: 25 },
  maintenance: { keywords: [["ac", 2], ["air con", 3], ["broken", 2], ["not working", 2], ["leak", 3], ["drip", 2], ["tap", 1], ["shower", 1], ["tv", 1], ["remote", 1], ["light", 1], ["bulb", 2], ["noise", 1], ["rattl", 3], ["safe", 1], ["wifi", 2], ["wi-fi", 2], ["fix", 2], ["repair", 3], ["hot water", 3], ["pressure", 2]], dept: "engineering", sla: 35 },
  fnb: { keywords: [["food", 2], ["order", 1], ["sandwich", 3], ["coffee", 2], ["breakfast", 2], ["dinner", 2], ["wine", 2], ["bottle", 1], ["room service", 4], ["cake", 3], ["menu", 2], ["hungry", 3], ["drink", 2], ["tea", 1], ["pizza", 3], ["burger", 3], ["vegetarian", 2], ["vegan", 2]], dept: "fnb", sla: 35 },
  concierge: { keywords: [["book", 2], ["reserve", 2], ["table", 2], ["taxi", 3], ["transfer", 3], ["airport", 3], ["tour", 2], ["jet ski", 3], ["excursion", 3], ["tickets", 2], ["late checkout", 4], ["checkout", 2], ["car", 1], ["recommend", 2], ["arrange", 2]], dept: "concierge", sla: 25 },
  amenity: { keywords: [["crib", 3], ["cot", 3], ["iron", 3], ["massage", 3], ["spa", 3], ["cabana", 3], ["gym", 2], ["yoga", 2], ["extra bed", 3], ["adapter", 2], ["charger", 2], ["umbrella", 2]], dept: "housekeeping", sla: 35 },
  complaint: { keywords: [["noisy", 3], ["complain", 4], ["unacceptable", 4], ["terrible", 3], ["angry", 3], ["disappointed", 3], ["waited", 2], ["slow", 2], ["rude", 4], ["dirty", 3], ["promised", 2], ["refund", 4], ["manager", 3]], dept: "frontdesk", sla: 15 },
  info: { keywords: [["what time", 3], ["when", 2], ["where", 2], ["how", 1], ["open", 2], ["hours", 3], ["pool", 1], ["wifi password", 4], ["password", 3], ["directions", 3], ["nearest", 2], ["beach", 1], ["weather", 3]], dept: "frontdesk", sla: 10 },
  smalltalk: { keywords: [["hello", 3], ["hi", 2], ["thanks", 3], ["thank you", 3], ["good morning", 3], ["good evening", 3], ["bye", 2], ["great", 1], ["love", 1]], dept: "concierge", sla: 10 },
  unknown: { keywords: [], dept: "frontdesk", sla: 20 },
};

export const infoAnswers: [string[], string][] = [
  [["pool", "swim"], "The infinity pool on the roof is open 6:00–22:00 and the lagoon pool 7:00–20:00. Towels are at both pool decks."],
  [["breakfast"], "Breakfast at Horizon Restaurant runs 6:30–10:30 daily, in-room breakfast can be pre-ordered until 22:00 the night before."],
  [["wifi", "wi-fi", "password", "internet"], "Wi-Fi is complimentary. Network AzureBay-Guest, password is your room number followed by your surname."],
  [["spa"], "Serenity Spa is open 9:00–21:00. I can hold a slot for you now if you tell me a preferred time."],
  [["gym", "fitness"], "The fitness centre on the ground floor is open 24 hours with your room key."],
  [["checkout", "check-out", "check out"], "Standard checkout is 11:00. Complimentary late checkout until 14:00 is reserved for Gold and Platinum loyalty members, subject to availability — I'm happy to check whether a later checkout can still be arranged for anyone else."],
  [["beach"], "The private beach is directly south of the lagoon pool, with lifeguards 7:00–19:00 and cabanas bookable through me."],
  [["restaurant", "dinner", "bar"], "Horizon Restaurant serves 12:00–23:00 and the Sky Bar on the roof from 17:00 until late. Sunset is around 18:40."],
  [["weather"], "Tomorrow looks clear with a high of 31°C and a light sea breeze in the afternoon."],
];

export interface ClassifiedMessage {
  intent: Intent;
  confidence: number;
  scores: Partial<Record<Intent, number>>;
  reply: string;
  requestType: RequestType | null;
  dept: string;
  sla: number;
  urgency: "normal" | "high";
}

export function classify(text: string): ClassifiedMessage {
  const lower = text.toLowerCase();
  const scores: Partial<Record<Intent, number>> = {};
  for (const [intent, def] of Object.entries(intents) as [Intent, (typeof intents)[Intent]][]) {
    let s = 0;
    for (const [kw, w] of def.keywords) if (lower.includes(kw)) s += w;
    if (s > 0) scores[intent] = s;
  }
  const ranked = (Object.entries(scores) as [Intent, number][]).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  let intent: Intent = top ? top[0] : "unknown";
  const total = ranked.reduce((a, [, v]) => a + v, 0);
  let confidence = top ? Math.min(0.97, 0.45 + (top[1] / Math.max(1, total)) * 0.5 + Math.min(0.1, top[1] * 0.02)) : 0.3;
  if (second && top && second[1] === top[1] && intent !== "complaint") confidence -= 0.15;
  if (intent === "info" && scores.complaint) intent = "complaint";
  const urgency: ClassifiedMessage["urgency"] = intent === "complaint" || /urgent|asap|immediately|now|emergency/.test(lower) ? "high" : "normal";
  const def = intents[intent];
  const requestType: RequestType | null = ["housekeeping", "maintenance", "fnb", "concierge", "amenity", "complaint"].includes(intent) ? (intent as RequestType) : null;
  let reply = "";
  switch (intent) {
    case "housekeeping":
      reply = "Of course — I've asked housekeeping to take care of that. A room attendant is on the way, usually within 15–20 minutes.";
      break;
    case "maintenance":
      reply = "Sorry about that. I've raised a work order and an engineer has been dispatched to your room. I'll keep this thread updated.";
      break;
    case "fnb":
      reply = "Lovely — I've sent that to the kitchen. In-room dining typically arrives in 25–35 minutes. Anything to drink with it?";
      break;
    case "concierge":
      reply = "Certainly. I've passed this to the concierge desk and you'll have a confirmation shortly. I can hold a time preference if you give me one.";
      break;
    case "amenity":
      reply = "Absolutely, I've arranged for that to be brought up. Housekeeping will deliver it within about 20 minutes.";
      break;
    case "complaint":
      reply = "I'm really sorry — that's not the experience we want for you. I've escalated this to the duty manager as a priority and someone will be in touch within 15 minutes.";
      break;
    case "info": {
      const hit = infoAnswers.find(([keys]) => keys.some((k) => lower.includes(k)));
      reply = hit ? hit[1] : "Happy to help — could you tell me a little more about what you're looking for? I can cover dining, pools, spa, transport and local activities.";
      break;
    }
    case "smalltalk":
      reply = /thank/.test(lower) ? "You're very welcome. I'm here any time you need something." : "Hello! I'm the Azure Bay concierge. I can arrange room service, housekeeping, bookings, transport, or answer questions about the resort.";
      break;
    default:
      reply = "I want to make sure I get this right — is this about your room, dining, a booking, or something that needs fixing?";
  }
  return { intent, confidence, scores, reply, requestType, dept: def.dept, sla: def.sla, urgency };
}

export function handleGuestMessage(state: SimState, model: ResortModel, roomId: string, text: string) {
  const c = classify(text);
  const room = state.rooms[roomId];
  const guestId = room?.guestId ?? null;
  const cell = model.roomById.get(roomId);
  state.chat.push({ id: `c-${state.chat.length + 1}`, role: "guest", text, t: state.t, roomId });
  let requestId: string | undefined;
  if (c.requestType) {
    const req = createRequest(state, model, roomId, c.requestType, text, "concierge", c.urgency === "high" ? Math.round(c.sla * 0.6) : c.sla, guestId);
    requestId = req.id;
    const tpl = requestTemplates[c.requestType][0];
    const staff = dispatchStaff(state, model, req, c.dept === "frontdesk" ? "frontdesk" : c.dept) ?? (tpl ? dispatchStaff(state, model, req, tpl.dept) : null);
    pushFeed(state, "concierge", `Concierge → ${c.requestType} task for ${cell?.number ?? roomId}${staff ? ` · ${staff.name} dispatched` : " · queued"}`, "room", roomId, c.urgency === "high" ? "warn" : "info");
  }
  state.chat.push({ id: `c-${state.chat.length + 1}`, role: "concierge", text: c.reply, t: state.t, intent: c.intent, requestId, roomId, confidence: c.confidence, urgency: c.urgency, source: "rule" });
  if (state.chat.length > 80) state.chat.splice(0, state.chat.length - 80);
  return { classified: c, requestId };
}
