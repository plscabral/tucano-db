import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTabs, type Tab } from "@/stores/tabs";
import { formatCount } from "@/lib/bsonTypes";
import { useT } from "@/lib/i18n";

const PAGE_SIZES = [10, 25, 50, 100, 200, 500];

export function Pagination({ tab }: { tab: Tab }) {
  const t = useT();
  const setPage = useTabs((s) => s.setPage);
  const setPageSize = useTabs((s) => s.setPageSize);

  const filtered = tab.result?.filteredCount ?? 0;
  const total = tab.result?.totalCount ?? 0;
  const pageSize = tab.result?.pageSize ?? tab.pageSize;
  const page = tab.page;
  const pages = Math.max(1, Math.ceil(filtered / pageSize));
  const from = filtered === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered);

  return (
    <div className="flex items-center justify-between border-t border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>
          {t("page.showing")} <span className="mono text-foreground">{from}–{to}</span>
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="mono text-tucano-400">{formatCount(filtered)}</span> {t("page.filtered")}
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="mono text-foreground/70">{formatCount(total)}</span> {t("page.total")}
        </span>
        {tab.result && (
          <>
            <span className="text-border">·</span>
            <span className="mono">{tab.result.elapsedMs}ms</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground/70">{t("page.perPage")}</span>
          <select
            value={tab.pageSize}
            onChange={(e) => setPageSize(tab.id, Number(e.target.value))}
            className="mono h-6 cursor-pointer rounded border border-border bg-background px-1.5 text-[11px] outline-none focus:border-tucano-400"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {!PAGE_SIZES.includes(tab.pageSize) && <option value={tab.pageSize}>{tab.pageSize}</option>}
          </select>
        </label>
        <span className="text-border">·</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1} onClick={() => setPage(tab.id, 1)}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1} onClick={() => setPage(tab.id, page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="mono px-1">
          {page} {t("page.of")} {pages}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pages} onClick={() => setPage(tab.id, page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pages} onClick={() => setPage(tab.id, pages)}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
