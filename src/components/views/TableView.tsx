import { memo, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ViewContextMenuProvider, useSetCtxTarget } from "@/components/views/ViewContextMenu";
import {
  detectBsonType,
  displayValue,
  dateMillis,
  isContainer,
  objectIdDate,
  TYPE_COLOR,
  TYPE_LABEL,
} from "@/lib/bsonTypes";
import { useSettings } from "@/stores/settings";
import { useTabs, useActiveTab } from "@/stores/tabs";
import { formatDate } from "@/lib/format";
import type { AppSettings } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ROW_H = 32;
const DEFAULT_W = 200;
const MIN_W = 64;
const INDEX_W = 52;

const Cell = memo(function Cell({ value, settings }: { value: unknown; settings: AppSettings }) {
  if (value === undefined) return <span className="text-muted-foreground/30">—</span>;
  const type = detectBsonType(value);
  if (isContainer(value)) {
    return <span className={cn("mono", TYPE_COLOR[type])}>{displayValue(value)}</span>;
  }
  let text = displayValue(value);
  const ms = dateMillis(value);
  if (ms !== null) text = formatDate(ms, settings);
  const oidMs = objectIdDate(value);
  const title = oidMs !== null ? `Created: ${formatDate(oidMs, settings)}` : undefined;
  return (
    <span className={cn("mono truncate", TYPE_COLOR[type])} title={title}>
      {text}
    </span>
  );
});

function TableGrid({ docs }: { docs: Record<string, unknown>[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const tab = useActiveTab();
  const setGridSort = useTabs((s) => s.setGridSort);
  const settings = useSettings((s) => s.settings);
  const setTarget = useSetCtxTarget();
  const t = useT();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const width = (c: string) => widths[c] ?? DEFAULT_W;

  // Drag-to-resize a column from its header's right edge.
  const startResize = (e: React.MouseEvent, c: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width(c);
    const onMove = (ev: MouseEvent) =>
      setWidths((prev) => ({ ...prev, [c]: Math.max(MIN_W, startW + (ev.clientX - startX)) }));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Ordered union of top-level keys (_id first) + first-seen BSON type per
  // column, in a single pass — avoids the O(cols×docs) docs.find() per column.
  const { columns, columnTypes } = useMemo(() => {
    const seen = new Set<string>();
    const cols: string[] = [];
    const types: Record<string, ReturnType<typeof detectBsonType>> = {};
    for (const d of docs) {
      for (const k of Object.keys(d)) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
        if (types[k] === undefined && d[k] !== undefined) types[k] = detectBsonType(d[k]);
      }
    }
    cols.sort((a, b) => (a === "_id" ? -1 : b === "_id" ? 1 : 0));
    return { columns: cols, columnTypes: types };
  }, [docs]);

  const rowVirtualizer = useVirtualizer({
    count: docs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

    const base = tab?.result ? (tab.result.page - 1) * tab.result.pageSize : 0;
  const totalWidth = INDEX_W + columns.reduce((sum, c) => sum + width(c), 0);

  return (
    <div ref={parentRef} className="h-full overflow-auto scroll-thin">
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        {/* header */}
        <div
          className="sticky top-0 z-20 flex h-8 items-center border-b border-border bg-card text-[11px] font-semibold"
          style={{ width: totalWidth }}
        >
          <div
            className="sticky left-0 z-10 flex h-full shrink-0 items-center justify-end border-r border-border bg-card px-2 text-muted-foreground/50"
            style={{ width: INDEX_W }}
          >
            #
          </div>
          {columns.map((c) => {
            const dir = tab?.gridSort?.field === c ? tab.gridSort.dir : 0;
            return (
              <div key={c} className="relative h-full shrink-0" style={{ width: width(c) }}>
                <button
                  onClick={() => tab && setGridSort(tab.id, c)}
                  className="mono flex h-full w-full items-center gap-1.5 px-3 text-left text-tucano-300 transition hover:text-tucano-200"
                  title={t("common.sort")}
                >
                  <span className="truncate">{c}</span>
                  {columnTypes[c] && (
                    <span className={cn("shrink-0 text-[9px] font-normal uppercase opacity-70", TYPE_COLOR[columnTypes[c]])}>
                      {TYPE_LABEL[columnTypes[c]]}
                    </span>
                  )}
                  <span className="flex-1" />
                  {dir === 1 && <ChevronUp className="h-3 w-3 shrink-0" />}
                  {dir === -1 && <ChevronDown className="h-3 w-3 shrink-0" />}
                </button>
                {/* resize handle */}
                <div
                  onMouseDown={(e) => startResize(e, c)}
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-tucano-400/50"
                />
              </div>
            );
          })}
        </div>
        {/* rows */}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const doc = docs[vi.index];
            return (
              <div
                key={vi.key}
                className="group absolute left-0 flex items-center border-b border-border/40 text-[12px] hover:bg-accent/40"
                style={{ top: vi.start, height: ROW_H, width: totalWidth }}
              >
                <div
                  className="mono sticky left-0 z-10 flex h-full shrink-0 items-center justify-end border-r border-border/60 bg-card px-2 text-[10px] tabular-nums text-muted-foreground/50 group-hover:text-muted-foreground"
                  style={{ width: INDEX_W }}
                >
                  {base + vi.index + 1}
                </div>
                {columns.map((c) => (
                  <div
                    key={c}
                    className="h-full shrink-0 truncate px-3 leading-[32px]"
                    style={{ width: width(c) }}
                    onContextMenu={() =>
                      setTarget({ kind: "field", path: c, fieldKey: c, value: doc[c], doc })
                    }
                  >
                    <Cell value={doc[c]} settings={settings} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TableView({ docs }: { docs: Record<string, unknown>[] }) {
  return (
    <ViewContextMenuProvider>
      <TableGrid docs={docs} />
    </ViewContextMenuProvider>
  );
}
