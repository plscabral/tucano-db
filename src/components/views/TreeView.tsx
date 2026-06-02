import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DocContextMenu, FieldContextMenu } from "@/components/DocActions";
import {
  detectBsonType,
  displayValue,
  isContainer,
  objectIdDate,
  TYPE_COLOR,
  TYPE_LABEL,
} from "@/lib/bsonTypes";
import { useSettings } from "@/stores/settings";
import { formatDate } from "@/lib/format";
import { dateMillis } from "@/lib/bsonTypes";
import { cn } from "@/lib/utils";

function Scalar({ value }: { value: unknown }) {
  const type = detectBsonType(value);
  const settings = useSettings((s) => s.settings);
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
}

function FieldNode({
  name,
  value,
  depth,
  doc,
}: {
  name: string;
  value: unknown;
  depth: number;
  doc: Record<string, unknown>;
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded py-0.5 pr-2 text-[12.5px] hover:bg-accent/50",
              container && "cursor-pointer"
            )}
            style={{ paddingLeft: depth * 14 + 4 }}
            onClick={() => container && setOpen(!open)}
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
              <Scalar value={value} />
            )}
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {TYPE_LABEL[type]}
            </span>
          </div>
        </ContextMenuTrigger>
        <FieldContextMenu fieldKey={name} value={value} doc={doc} />
      </ContextMenu>
      {container && open && (
        <div>
          {entries.map(([k, v]) => (
            <FieldNode key={k} name={k} value={v} depth={depth + 1} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ docs }: { docs: Record<string, unknown>[] }) {
  return (
    <div className="h-full space-y-2 overflow-auto p-2 scroll-thin">
      {docs.map((doc, i) => (
        <ContextMenu key={(doc._id as { $oid?: string })?.$oid ?? i}>
          <ContextMenuTrigger asChild>
            <div className="rounded-lg border border-border bg-card/60 p-2 transition hover:border-tucano-400/30">
              <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                #{i + 1}
              </div>
              {Object.entries(doc).map(([k, v]) => (
                <FieldNode key={k} name={k} value={v} depth={0} doc={doc} />
              ))}
            </div>
          </ContextMenuTrigger>
          <DocContextMenu doc={doc} />
        </ContextMenu>
      ))}
    </div>
  );
}
