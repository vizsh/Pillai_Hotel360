import { describe, expect, it } from "vitest";
import { formatTaskList, handleCallback, handleFreeTextReport, handleStartCommand, parseRoomNumber, unlinkedReply, type StaffSummary, type TaskSummary } from "@/lib/telegram/bot";

const roster: StaffSummary[] = [
  { id: "s-1", name: "Priya Sharma", dept: "housekeeping" },
  { id: "s-2", name: "Arjun Mehta", dept: "engineering" },
];

describe("handleStartCommand", () => {
  it("links on an exact name match", () => {
    const action = handleStartCommand("Priya Sharma", roster);
    expect(action.kind).toBe("link");
    if (action.kind === "link") {
      expect(action.staffId).toBe("s-1");
      expect(action.reply).toContain("Priya Sharma");
    }
  });

  it("links on a case-insensitive match", () => {
    const action = handleStartCommand("priya sharma", roster);
    expect(action.kind).toBe("link");
  });

  it("links on an unambiguous partial (first-name-only) match", () => {
    const action = handleStartCommand("Arjun", roster);
    expect(action.kind).toBe("link");
    if (action.kind === "link") expect(action.staffId).toBe("s-2");
  });

  it("refuses to guess when a partial match is ambiguous", () => {
    const ambiguousRoster: StaffSummary[] = [...roster, { id: "s-3", name: "Priya Nair", dept: "spa" }];
    const action = handleStartCommand("Priya", ambiguousRoster);
    expect(action.kind).toBe("reply");
  });

  it("replies with the welcome message for an empty name", () => {
    const action = handleStartCommand("", roster);
    expect(action.kind).toBe("reply");
  });

  it("replies (not links) for a name not on the roster", () => {
    const action = handleStartCommand("Nobody Here", roster);
    expect(action.kind).toBe("reply");
  });
});

describe("parseRoomNumber", () => {
  it("extracts a room number that exists in the roster", () => {
    expect(parseRoomNumber("305 tap is leaking", ["204", "305", "512"])).toBe("305");
  });

  it("returns null when no token matches a real room number", () => {
    expect(parseRoomNumber("the gym is open 24 hours", ["204", "305", "512"])).toBeNull();
  });

  it("returns null for text with no numbers at all", () => {
    expect(parseRoomNumber("towels please", ["204", "305"])).toBeNull();
  });
});

describe("handleFreeTextReport", () => {
  const validRooms = ["204", "305"];

  it("logs a report when a real room number is present", () => {
    const action = handleFreeTextReport("305 tap is leaking", "Priya", validRooms);
    expect(action.kind).toBe("report_issue");
    if (action.kind === "report_issue") {
      expect(action.roomNumber).toBe("305");
      expect(action.reply).toContain("305");
    }
  });

  it("declines to log a ticket when no room number is found", () => {
    const action = handleFreeTextReport("just checking in", "Priya", validRooms);
    expect(action.kind).toBe("reply");
  });
});

describe("formatTaskList", () => {
  it("reports nothing assigned when the task list is empty", () => {
    const action = formatTaskList("Priya", []);
    expect(action.kind).toBe("reply");
    if (action.kind === "reply") expect(action.text.toLowerCase()).toContain("nothing assigned");
  });

  it("produces one Done button per task, matching the task count", () => {
    const tasks: TaskSummary[] = [
      { id: "r-1", roomNumber: "204", type: "housekeeping", text: "towels", ageMinutes: 5, slaMin: 20 },
      { id: "r-2", roomNumber: "305", type: "maintenance", text: "AC noisy", ageMinutes: 45, slaMin: 30 },
    ];
    const action = formatTaskList("Priya", tasks);
    expect(action.kind).toBe("reply");
    if (action.kind === "reply") {
      expect(action.buttons).toHaveLength(2);
      expect(action.buttons?.[0][0].callback_data).toBe("done:r-1");
    }
  });

  it("flags an SLA-breached task distinctly from one still within SLA", () => {
    const tasks: TaskSummary[] = [{ id: "r-1", roomNumber: "204", type: "maintenance", text: "AC noisy", ageMinutes: 45, slaMin: 30 }];
    const action = formatTaskList("Priya", tasks);
    if (action.kind === "reply") expect(action.text).toContain("SLA breached");
  });
});

describe("handleCallback", () => {
  it("parses a well-formed done:<id> callback", () => {
    const action = handleCallback("done:rq-42");
    expect(action.kind).toBe("complete_task");
    if (action.kind === "complete_task") expect(action.requestId).toBe("rq-42");
  });

  it("no-ops on malformed or unrecognized callback data", () => {
    expect(handleCallback("bogus").kind).toBe("noop");
    expect(handleCallback("done:").kind).toBe("noop");
  });
});

describe("unlinkedReply", () => {
  it("always returns a reply directing the user to /start", () => {
    const action = unlinkedReply();
    expect(action.kind).toBe("reply");
    if (action.kind === "reply") expect(action.text).toContain("/start");
  });
});
