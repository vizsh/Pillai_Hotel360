export type DetectionCategory = "fire" | "parking" | "altercation";

export interface ClipMeta {
  id: string;
  label: string;
  src: string;
}

/** The user-supplied test clips under public/surveillance/ (gitignored — see .gitignore's
 * "surveillance demo video dataset" entry; not part of the committed repo). Filenames are
 * exactly as extracted from the provided dataset zip. */
export const CLIPS: Record<DetectionCategory, ClipMeta[]> = {
  fire: [
    { id: "fire-1", label: "Dashcam / exterior clip", src: "/surveillance/fire_detection/00e18d86-3389d8dc.mp4" },
    { id: "fire-2", label: "Bucket fire", src: "/surveillance/fire_detection/bucket11.mp4" },
    { id: "fire-3", label: "Printer/equipment fire", src: "/surveillance/fire_detection/printer31.mp4" },
    { id: "fire-4", label: "Room fire", src: "/surveillance/fire_detection/roomfire41.mp4" },
  ],
  parking: [
    { id: "park-1", label: "Overhead lot (1920×1080)", src: "/surveillance/parking_lot/parking_1920_1080.mp4" },
    { id: "park-2", label: "Lot feed 1", src: "/surveillance/parking_lot/video1.mp4" },
    { id: "park-3", label: "Lot feed 2", src: "/surveillance/parking_lot/video2.mp4" },
    { id: "park-4", label: "Lot feed 3", src: "/surveillance/parking_lot/video3.mp4" },
    { id: "park-5", label: "Lot feed 4", src: "/surveillance/parking_lot/video4.mp4" },
  ],
  altercation: [{ id: "alt-1", label: "Suspicious behaviour clip", src: "/surveillance/sus_behaviour/Abuse018_x264.mp4" }],
};

export const CATEGORY_META: Record<DetectionCategory, { label: string; description: string; color: string }> = {
  fire: { label: "Fire / smoke", description: "Warm-color pixel coverage + frame-to-frame flicker, sampled and persistence-gated.", color: "#f4436c" },
  parking: { label: "Parking occupancy", description: "Real vehicle detection (COCO-SSD), binned into a zone grid over the frame.", color: "#c084fc" },
  altercation: { label: "Altercation / crowd motion", description: "Person detection + inter-frame motion magnitude and box-overlap frequency, persistence-gated.", color: "#fb7185" },
};
