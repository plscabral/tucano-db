import { Clipboard, ClipboardCopy, ClipboardList, Copy, Filter, Pencil, Trash2 } from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useDocActions, prettyDoc, docLabel, type DocEditMode } from "@/stores/docActions";
import { useTabs } from "@/stores/tabs";
import { displayValue, isContainer } from "@/lib/bsonTypes";
import { useT } from "@/lib/i18n";

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function valueText(v: unknown): string {
  return isContainer(v) ? JSON.stringify(v, null, 2) : displayValue(v);
}

/** Copy key / value / key+value items for a single field or cell. */
export function FieldCopyItems({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  const t = useT();
  const vt = valueText(value);
  return (
    <>
      <ContextMenuItem onClick={() => copy(fieldKey)}>
        <Clipboard className="mr-2 h-3.5 w-3.5" /> {t("copy.key")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => copy(vt)}>
        <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> {t("copy.value")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => copy(`${fieldKey}: ${vt}`)}>
        <ClipboardList className="mr-2 h-3.5 w-3.5" /> {t("copy.both")}
      </ContextMenuItem>
    </>
  );
}

/** Edit / duplicate / delete items for a whole document. */
export function DocActionItems({ doc }: { doc: Record<string, unknown> }) {
  const openEditor = useDocActions((s) => s.openEditor);
  const openDelete = useDocActions((s) => s.openDelete);
  const t = useT();

  const edit = (mode: DocEditMode) => {
    if (mode === "duplicate") {
      const clone = { ...doc };
      delete clone._id;
      openEditor("duplicate", prettyDoc(clone));
    } else {
      openEditor("edit", prettyDoc(doc));
    }
  };

  const del = () => openDelete(JSON.stringify(doc._id ?? null), docLabel(doc));

  return (
    <>
      <ContextMenuItem onClick={() => edit("edit")}>
        <Pencil className="mr-2 h-3.5 w-3.5" /> {t("doc.edit")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => edit("duplicate")}>
        <Copy className="mr-2 h-3.5 w-3.5" /> {t("doc.duplicate")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => copy(prettyDoc(doc))}>
        <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> {t("doc.copyDoc")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-destructive" onClick={del}>
        <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("doc.delete")}
      </ContextMenuItem>
    </>
  );
}

/** Document-level context menu (edit / duplicate / copy / delete). */
export function DocContextMenu({ doc }: { doc: Record<string, unknown> }) {
  return (
    <ContextMenuContent className="w-52">
      <DocActionItems doc={doc} />
    </ContextMenuContent>
  );
}

/** Field/cell context menu: copy options + add-to-filter + document actions. */
export function FieldContextMenu({
  path,
  fieldKey,
  value,
  doc,
}: {
  path: string;
  fieldKey: string;
  value: unknown;
  doc: Record<string, unknown>;
}) {
  const t = useT();
  const addToFilter = useTabs((s) => s.addToFilter);
  return (
    <ContextMenuContent className="w-52">
      <FieldCopyItems fieldKey={fieldKey} value={value} />
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => addToFilter(path, value)}>
        <Filter className="mr-2 h-3.5 w-3.5" /> {t("filter.add")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <DocActionItems doc={doc} />
    </ContextMenuContent>
  );
}
