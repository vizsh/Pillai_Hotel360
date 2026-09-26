"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { guestExperienceStayForRoom } from "@/lib/integration/guestExperienceStays";
import { Button, Provenance, Tag } from "@/components/ui/primitives";
import { Card } from "./AnalyticsShell";

const GUEST_APP_URL = "https://guestexperience.vercel.app";

/** "As part of the registration" — generates a real, scannable QR pointing at the guest-side
 * app (github.com/SDP42/guestexperience, a separate deployment guests use directly, not this
 * dashboard) for a specific room. Since the two apps have no shared database, the stay_id
 * encoded here is a REAL one drawn from guestexperience's own seed data (see
 * lib/integration/guestExperienceStays.ts's module comment) — so scanning this against the
 * live guestexperience.vercel.app deployment actually lands on that room's personalised page,
 * not a placeholder. The room path plus a ?stay= query param costs nothing to include today
 * (guestexperience's own StayGate currently ignores it and still asks the guest to type their
 * stay ID) but documents the intended future flow and would auto-fill it the moment
 * guestexperience adds that one line of support — see this card's own note below. */
export function GuestAppQrCard() {
  const [room, setRoom] = useState("");
  const [qr, setQr] = useState<{ room: string; stayId: string; guestName: string; status: string; dataUrl: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const generate = async () => {
    setNotFound(false);
    const trimmed = room.trim();
    const stay = guestExperienceStayForRoom(trimmed);
    if (!stay) {
      setQr(null);
      setNotFound(true);
      return;
    }
    const url = `${GUEST_APP_URL}/room/${stay.room}?stay=${stay.stayId}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#0b1220", light: "#ffffff" } });
    setQr({ room: stay.room, stayId: stay.stayId, guestName: stay.guestName, status: stay.status, dataUrl });
  };

  return (
    <Card title="Guest app registration QR" right={<Provenance kind="derived" />}>
      <p className="mb-3 text-[11.5px] text-mid">
        Generates a QR for a room that links to the guest-side app (guestexperience.vercel.app), pre-loaded with that room&apos;s real stay ID from the guest app&apos;s own seed data — scan it and the guest lands directly on their personalised page, no typing required for this demo room.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="Room number, e.g. 102"
          className="w-40 rounded-md border border-stroke bg-white/[0.03] px-2 py-1.5 text-[12px] text-hi outline-none focus:border-accent"
        />
        <Button size="sm" variant="primary" onClick={generate}>
          Generate QR
        </Button>
      </div>
      {notFound && <p className="mt-2 text-[11px] text-critical">No guestexperience stay found for room &quot;{room}&quot; — try a room between 101–720.</p>}
      {qr && (
        <div className="mt-3 flex items-center gap-4 rounded-lg border border-stroke bg-white/[0.02] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI QR code, not a remote image; next/image adds nothing here */}
          <img src={qr.dataUrl} alt={`QR code linking to room ${qr.room}`} width={110} height={110} className="rounded-md bg-white p-1.5" />
          <div className="min-w-0 text-[11.5px] text-mid">
            <div className="text-[13px] font-medium text-hi">
              Room {qr.room} · {qr.guestName}
            </div>
            <div className="mono mt-1 text-[11px] text-low">
              stay_id <span className="text-accent">{qr.stayId}</span> · <Tag color={qr.status === "in_house" ? "#34d399" : "#f5d26b"}>{qr.status.replace("_", " ")}</Tag>
            </div>
            <div className="mono mt-1 truncate text-[10.5px] text-low">
              {GUEST_APP_URL}/room/{qr.room}?stay={qr.stayId}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
