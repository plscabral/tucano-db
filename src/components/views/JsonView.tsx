import { useMemo } from "react";
import { RawEditor } from "@/viewers/RawEditor";

/** Read-only pretty JSON of the current page of documents. */
export function JsonView({ docs }: { docs: Record<string, unknown>[] }) {
  const text = useMemo(() => JSON.stringify(docs, null, 2), [docs]);
  return (
    <div className="h-full p-2">
      <RawEditor value={text} readOnly minHeight={0} className="h-full" />
    </div>
  );
}
