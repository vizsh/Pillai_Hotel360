import type { RequestType } from "./types";
import { pick, type Rand } from "@/lib/utils";

export const requestTemplates: Record<RequestType, { text: string; sla: number; dept: string; minutes: number }[]> = {
  housekeeping: [
    { text: "Could we get extra towels and pillows please?", sla: 20, dept: "housekeeping", minutes: 8 },
    { text: "Room hasn't been serviced yet today.", sla: 30, dept: "housekeeping", minutes: 30 },
    { text: "Please send someone to empty the bin and restock the minibar.", sla: 25, dept: "housekeeping", minutes: 10 },
    { text: "Turndown service requested for 8pm.", sla: 45, dept: "housekeeping", minutes: 12 },
  ],
  maintenance: [
    { text: "The AC is making a loud rattling noise and not cooling properly.", sla: 30, dept: "engineering", minutes: 35 },
    { text: "Bathroom tap is dripping constantly.", sla: 45, dept: "engineering", minutes: 20 },
    { text: "TV remote isn't working, tried new batteries.", sla: 40, dept: "engineering", minutes: 10 },
    { text: "Shower water pressure is very weak.", sla: 45, dept: "engineering", minutes: 25 },
    { text: "Safe won't open, keypad seems dead.", sla: 20, dept: "engineering", minutes: 15 },
  ],
  fnb: [
    { text: "Room service: two club sandwiches and a pot of coffee.", sla: 35, dept: "fnb", minutes: 12 },
    { text: "Can we get a bottle of the house white sent up, chilled?", sla: 25, dept: "fnb", minutes: 8 },
    { text: "Breakfast in room tomorrow at 7:30 please, one vegetarian.", sla: 60, dept: "fnb", minutes: 10 },
    { text: "Birthday cake for tonight, chocolate, name is Priya.", sla: 120, dept: "fnb", minutes: 15 },
  ],
  concierge: [
    { text: "Can you arrange an airport transfer for 6am tomorrow?", sla: 30, dept: "concierge", minutes: 6 },
    { text: "Book a table for four at the restaurant at 8pm.", sla: 20, dept: "concierge", minutes: 5 },
    { text: "What water sports are available and can we book a jet ski?", sla: 20, dept: "concierge", minutes: 6 },
    { text: "Need a late checkout tomorrow, flight is at 9pm.", sla: 30, dept: "frontdesk", minutes: 5 },
  ],
  amenity: [
    { text: "Could we get a crib for the baby?", sla: 40, dept: "housekeeping", minutes: 15 },
    { text: "Please send an iron and ironing board.", sla: 25, dept: "housekeeping", minutes: 8 },
    { text: "We'd like a couples massage at the spa tomorrow.", sla: 45, dept: "spa", minutes: 6 },
    { text: "Can we reserve a pool cabana for the afternoon?", sla: 30, dept: "concierge", minutes: 5 },
  ],
  complaint: [
    { text: "The room next door is extremely noisy, can't sleep.", sla: 15, dept: "security", minutes: 12 },
    { text: "We were promised a sea view and this room faces the car park.", sla: 20, dept: "frontdesk", minutes: 15 },
    { text: "Wi-Fi keeps dropping every few minutes.", sla: 30, dept: "engineering", minutes: 20 },
    { text: "Waited 40 minutes at the restaurant, no one took our order.", sla: 15, dept: "fnb", minutes: 10 },
  ],
};

export const requestWeights: Record<RequestType, number> = {
  housekeeping: 0.28,
  fnb: 0.24,
  maintenance: 0.16,
  concierge: 0.14,
  amenity: 0.1,
  complaint: 0.08,
};

export function pickRequestType(r: Rand, maintBias = 0): RequestType {
  let x = r();
  const w = { ...requestWeights, maintenance: requestWeights.maintenance + maintBias };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) {
    x -= v / total;
    if (x <= 0) return k as RequestType;
  }
  return "housekeeping";
}

const positive = [
  "Absolutely stunning sea view, the staff were warm and attentive throughout.",
  "Breakfast spread was excellent and the pool area is beautifully kept.",
  "Room was spotless, bed extremely comfortable, housekeeping went above and beyond.",
  "Spa was a highlight, therapists were skilled and the ambience was calming.",
  "Check-in was smooth and quick, concierge sorted our transfers effortlessly.",
  "Loved the infinity pool at sunset, the sky bar cocktails were superb.",
  "Great value for a beachfront property, will definitely return.",
  "Kids club kept the children busy and the family suite was spacious.",
];
const mixed = [
  "Lovely resort but the AC in our room was noisy at night.",
  "Food was good although service at dinner was slow on the second evening.",
  "Beautiful grounds, room was a little dated and the shower pressure was weak.",
  "Staff were friendly but housekeeping missed our room one day.",
  "Great location, Wi-Fi was patchy in the room which was frustrating for work.",
  "Pool was fantastic, breakfast got crowded and ran out of some items.",
];
const negative = [
  "AC broke down and it took hours to get someone to look at it, very uncomfortable night.",
  "Elevator was out of service for most of our stay, had to use the stairs to the sixth floor.",
  "Room wasn't cleaned properly, found hair in the bathroom. Disappointing for the price.",
  "Restaurant service was painfully slow and the food arrived cold.",
  "Noise from the corridor and neighbouring rooms made it impossible to rest.",
  "Requested a sea view months in advance and got a car park view, nobody could help.",
];

export function reviewText(r: Rand, sentiment: number) {
  if (sentiment > 0.35) return pick(r, positive);
  if (sentiment > -0.2) return pick(r, mixed);
  return pick(r, negative);
}

export const aspectLexicon: Record<string, { keywords: string[]; dept: string }> = {
  room: { keywords: ["room", "bed", "bathroom", "shower", "dated", "spacious", "clean", "spotless", "hair", "view"], dept: "housekeeping" },
  cleanliness: { keywords: ["clean", "spotless", "housekeeping", "dirty", "hair", "serviced", "towels"], dept: "housekeeping" },
  hvac: { keywords: ["ac", "air con", "air conditioning", "noisy", "rattling", "cooling", "hot", "uncomfortable"], dept: "engineering" },
  facilities: { keywords: ["elevator", "lift", "wi-fi", "wifi", "pool", "gym", "spa", "stairs", "pressure"], dept: "engineering" },
  food: { keywords: ["breakfast", "food", "dinner", "restaurant", "cold", "menu", "cocktails", "bar", "order"], dept: "fnb" },
  service: { keywords: ["staff", "service", "friendly", "attentive", "slow", "waited", "concierge", "check-in", "nobody", "help"], dept: "frontdesk" },
  noise: { keywords: ["noise", "noisy", "loud", "sleep", "rest", "corridor"], dept: "security" },
  value: { keywords: ["value", "price", "expensive", "worth", "return"], dept: "frontdesk" },
};

export const positiveWords = ["stunning", "excellent", "warm", "attentive", "beautiful", "spotless", "comfortable", "above and beyond", "highlight", "skilled", "calming", "smooth", "quick", "effortlessly", "loved", "superb", "great", "fantastic", "lovely", "friendly", "good", "spacious", "value", "definitely"];
export const negativeWords = ["noisy", "slow", "dated", "weak", "missed", "patchy", "frustrating", "crowded", "ran out", "broke", "hours", "uncomfortable", "out of service", "stairs", "dirty", "hair", "disappointing", "painfully", "cold", "impossible", "nobody", "car park", "dropping", "rattling", "dripping", "dead"];
export const negations = ["not", "no", "never", "wasn't", "isn't", "didn't", "couldn't", "without"];
