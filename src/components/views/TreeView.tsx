import { memo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { ViewContextMenuProvider, useSetCtxTarget, type CtxTarget } from "@/components/views/ViewContextMenu";
import {
  detectBsonType,
  displayValue,
  isContainer,
  objectIdDate,
  TYPE_COLOR,
  TYPE_BADGE_COLOR,
  TYPE_LABEL,
} from "@/lib/bsonTypes";
import { useSettings } from "@/stores/settings";
import { useActiveTab } from "@/stores/tabs";
import { formatDate } from "@/lib/format";
import { dateMillis } from "@/lib/bsonTypes";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

type Settings = AppSettings;
type SetTarget = (t: CtxTarget) => void;

const Scalar = memo(function Scalar({ value, settings }: { value: unknown; settings: Settings }) {
  const type = detectBsonType(value);
  let text = displayValue(value);
  const ms = dateMillis(value);
  if (ms !== null) text = formatDate(ms, settings);
  // ObjectIds embed a creation timestamp — surface it on hover.
  const oidMs = objectIdDate(value);
  const title = oidMs !== null ? `Created: ${formatDate(oidMs, settings)}` : undefined;
  return (
    <span className={cn("mono", TYPE_COLOR[type])} title={title}>
      {type === "string" ? `"${text}"` : text}
    </span>
  );
});

const FieldNode = memo(function FieldNode({
  name,
  path,
  value,
  depth,
  doc,
  settings,
  setTarget,
}: {
  name: string;
  path: string;
  value: unknown;
  depth: number;
  doc: Record<string, unknown>;
  settings: Settings;
  setTarget: SetTarget;
}) {
  const [open, setOpen] = useState(depth < 1);
  const type = detectBsonType(value);
  const container = isContainer(value);

  const entries: [string, unknown][] = container
    ? type === "array"
      ? (value as unknown[]).map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>)
    : [];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded py-0.5 pr-2 text-[12.5px] hover:bg-accent/50",
          container && "cursor-pointer"
        )}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => container && setOpen(!open)}
        onContextMenu={() => setTarget({ kind: "field", path, fieldKey: name, value, doc })}
      >
        {container ? (
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="mono font-medium text-foreground/90">{name}</span>
        <span className="text-muted-foreground/50">:</span>
        {container ? (
          <span className={cn("mono", TYPE_COLOR[type])}>
            {type === "array" ? `[${entries.length}]` : `{${entries.length}}`}
          </span>
        ) : (
          <Scalar value={value} settings={settings} />
        )}
        <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide", TYPE_BADGE_COLOR[type])}>
          {TYPE_LABEL[type]}
        </span>
      </div>
      {container && open && (
        <div>
          {entries.map(([k, v]) => (
            <FieldNode
              key={k}
              name={k}
              path={`${path}.${k}`}
              value={v}
              depth={depth + 1}
              doc={doc}
              settings={settings}
              setTarget={setTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function DocCard({
  doc,
  index,
  settings,
  setTarget,
}: {
  doc: Record<string, unknown>;
  index: number;
  settings: Settings;
  setTarget: SetTarget;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card/60 p-2 transition hover:border-tucano-400/30"
      onContextMenu={(e) => {
        // Field rows set their own target and bubble up here; only claim the
        // doc-level menu when the right-click landed on the card chrome itself.
        if (e.target === e.currentTarget) setTarget({ kind: "doc", doc });
      }}
    >
      <div
        className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60"
        onContextMenu={() => setTarget({ kind: "doc", doc })}
      >
        #{index + 1}
      </div>
      {Object.entries(doc).map(([k, v]) => (
        <FieldNode
          key={k}
          name={k}
          path={k}
          value={v}
          depth={0}
          doc={doc}
          settings={settings}
          setTarget={setTarget}
        />
      ))}
    </div>
  );
}

function TreeList({ docs }: { docs: Record<string, unknown>[] }) {
  const settings = useSettings((s) => s.settings);
  const setTarget = useSetCtxTarget();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: docs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto p-2 scroll-thin">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 w-full pb-2"
            style={{ top: 0, transform: `translateY(${vi.start}px)` }}
          >
            <DocCard doc={docs[vi.index]} index={vi.index} settings={settings} setTarget={setTarget} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TreeView({ docs }: { docs: Record<string, unknown>[] }) {
  const tab = useActiveTab();
  // Remount on result change so virtualizer measurements don't carry over.
  const key = `${tab?.id ?? "t"}:${tab?.result?.page ?? 0}`;
  return (
    <ViewContextMenuProvider>
      <TreeList key={key} docs={docs} />
    </ViewContextMenuProvider>
  );
}
