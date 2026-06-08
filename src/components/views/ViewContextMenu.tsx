import { createContext, useContext, useState, type ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DocContextMenu, FieldContextMenu } from "@/components/DocActions";

/** What the user right-clicked inside a result view. */
export type CtxTarget =
  | { kind: "field"; path: string; fieldKey: string; value: unknown; doc: Record<string, unknown> }
  | { kind: "doc"; doc: Record<string, unknown> }
  | null;

const SetTargetCtx = createContext<(t: CtxTarget) => void>(() => {});

/** Stable setter that cells/fields call from their `onContextMenu` handler. */
export function useSetCtxTarget() {
  return useContext(SetTargetCtx);
}

/**
 * Renders ONE Radix context menu for an entire view. Cells capture what was
 * clicked via `useSetCtxTarget()` in a plain `onContextMenu` (no preventDefault —
 * the inner handler fires first by bubbling, then Radix opens this single menu).
 * This replaces the per-cell/per-field ContextMenu explosion that froze the UI.
 */
export function ViewContextMenuProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<CtxTarget>(null);
  return (
    <SetTargetCtx.Provider value={setTarget}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="h-full">{children}</div>
        </ContextMenuTrigger>
        {target?.kind === "doc" ? (
          <DocContextMenu doc={target.doc} />
        ) : target?.kind === "field" ? (
          <FieldContextMenu
            path={target.path}
            fieldKey={target.fieldKey}
            value={target.value}
            doc={target.doc}
          />
        ) : (
          <ContextMenuContent className="w-52" />
        )}
      </ContextMenu>
    </SetTargetCtx.Provider>
  );
}
