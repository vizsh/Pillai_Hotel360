"use client";

import { X, FileCode2, BookOpen, Radio } from "lucide-react";
import { useUi } from "@/store/ui";
import { moduleMeta } from "@/lib/intelligence/registry";
import { methodology } from "@/lib/methodology";
import type { ModuleId } from "@/lib/sim/types";
import { Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function MethodologyPanel() {
  const openId = useUi((s) => s.methodologyModule);
  const close = useUi((s) => s.closeMethodology);
  const open = useUi((s) => s.openMethodology);
  if (!openId) return null;
  const meta = moduleMeta[openId];
  const m = methodology[openId];

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-void/60 backdrop-blur-sm" onClick={close} role="dialog" aria-label={`Methodology — ${meta.label}`}>
      <div className="glass w-[560px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(moduleMeta) as ModuleId[]).map((id) => (
            <button key={id} onClick={() => open(id)}>
              <Tag color={moduleMeta[id].color} className={cn("cursor-pointer", id === openId ? "brightness-125" : "opacity-50 hover:opacity-100")}>
                {moduleMeta[id].short}
              </Tag>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Tag color={meta.color}>{meta.short}</Tag>
            <h2 className="font-display text-[18px] font-semibold">{meta.label}</h2>
          </div>
          <button onClick={close} className="text-low hover:text-hi" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-mid">{meta.description}</p>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-stroke bg-white/[0.02] p-3">
          <FileCode2 size={14} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <div className="label">Method</div>
            <p className="mt-0.5 text-[12.5px] text-hi">{meta.method}</p>
            <p className="mono mt-1 text-[10.5px] text-low">{m.file}</p>
          </div>
        </div>

        <div className="mt-2 flex items-start gap-2 rounded-lg border border-stroke bg-white/[0.02] p-3">
          <BookOpen size={14} className="mt-0.5 shrink-0 text-warm" />
          <div>
            <div className="label">Real-world benchmark</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-hi">{m.benchmark}</p>
            <p className="mt-1 text-[10.5px] text-low">{m.source}</p>
          </div>
        </div>

        <div className="mt-2 flex items-start gap-2 rounded-lg border border-stroke bg-white/[0.02] p-3">
          <Radio size={14} className="mt-0.5 shrink-0 text-positive" />
          <div>
            <div className="label">On real data</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-mid">{m.realWorldNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
