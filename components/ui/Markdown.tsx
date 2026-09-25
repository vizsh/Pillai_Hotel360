/** A small, dependency-free renderer for the Markdown subset the AI prompts
 * (lib/ai/opsAssistantPrompt.ts, lib/ai/conciergePrompt.ts) instruct the model to use:
 * headers, bold, bullet/numbered lists, and pipe tables. Not a general Markdown parser —
 * deliberately scoped to what this project's own system prompts ask the model to produce, so
 * there's no dangerouslySetInnerHTML and no external dependency for a handful of block types. */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-hi">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part ? <span key={`${keyPrefix}-${i}`}>{part}</span> : null;
  });
}

function parseTable(lines: string[], start: number): { rows: string[][]; next: number } | null {
  if (!lines[start]?.includes("|") || !/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[start + 1] ?? "")) return null;
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length && lines[i].includes("|")) {
    if (i !== start + 1) {
      const cells = lines[i]
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
      rows.push(cells);
    }
    i++;
  }
  return { rows, next: i };
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={listBuffer.ordered ? "list-decimal space-y-0.5 pl-4" : "list-disc space-y-0.5 pl-4"}>
        {listBuffer.items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${blocks.length}-${idx}`)}</li>
        ))}
      </Tag>,
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      i++;
      continue;
    }

    const table = parseTable(lines, i);
    if (table) {
      flushList();
      const [header, ...body] = table.rows;
      blocks.push(
        <table key={`table-${blocks.length}`} className="my-1 w-full text-left text-[11.5px]">
          {header && (
            <thead>
              <tr className="border-b border-stroke/60 text-low">
                {header.map((h, hi) => (
                  <th key={hi} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="border-b border-stroke/30 last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1 pr-3 text-mid">
                    {renderInline(cell, `td-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      i = table.next;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const size = level === 1 ? "text-[14px]" : level === 2 ? "text-[13px]" : "text-[12px]";
      blocks.push(
        <div key={`h-${blocks.length}`} className={`${size} mt-1 font-semibold text-hi`}>
          {renderInline(heading[2], `h-${blocks.length}`)}
        </div>,
      );
      i++;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const item = (bullet ?? numbered)![1];
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(item);
      i++;
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-snug">
        {renderInline(trimmed, `p-${blocks.length}`)}
      </p>,
    );
    i++;
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
