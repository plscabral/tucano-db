import { useEffect, useState } from "react";
import { Activity, Cpu, Database, HardDrive, Loader2, Network, Plug, Server } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useTree } from "@/stores/tree";
import type { ServerOverview } from "@/lib/types";
import { formatBytes, formatCount } from "@/lib/bsonTypes";
import { formatUptime } from "@/lib/format";
import { Display } from "@/components/Display";
import { useT } from "@/lib/i18n";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-tucano-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mono text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Bars({ data }: { data: { label: string; value: number; render: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="mono w-28 truncate text-[11px] text-muted-foreground">{d.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full tcn-accent"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="mono w-16 text-right text-[11px]">{d.render}</span>
        </div>
      ))}
    </div>
  );
}

export function Overview() {
  const connId = useTree((s) => s.focusedConn ?? s.open[0] ?? null);
  const t = useT();
  const [data, setData] = useState<ServerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connId) return;
    setData(null);
    setError(null);
    ipc.serverOverview(connId).then(setData).catch((e) => setError(String(e)));
  }, [connId]);

  if (error) {
    return (
      <div className="m-6 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-tucano-400" />
      </div>
    );
  }

  const connPct = data.connectionsAvailable
    ? Math.round(
        (data.connectionsCurrent / (data.connectionsCurrent + data.connectionsAvailable)) * 100
      )
    : 0;

  return (
    <div className="tcn-grid flex-1 overflow-auto p-6 scroll-thin">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 text-2xl">
          <Display lead={t("ov.titleLead")} accent={t("ov.titleAccent")} />
        </div>
        <p className="mb-6 mono text-xs text-muted-foreground">{data.host}</p>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Server} label={t("ov.version")} value={data.version} sub="MongoDB" />
          <StatCard icon={Activity} label={t("ov.uptime")} value={formatUptime(data.uptimeSeconds)} />
          <StatCard
            icon={Plug}
            label={t("ov.connections")}
            value={String(data.connectionsCurrent)}
            sub={`${connPct}% ${t("ov.poolUsed")}`}
          />
          <StatCard
            icon={Database}
            label={t("ov.collections")}
            value={formatCount(data.totalCollections)}
            sub={`${data.databases.length} ${t("ov.databases")}`}
          />
          <StatCard icon={HardDrive} label={t("ov.dataSize")} value={formatBytes(data.totalDataSize)} />
          <StatCard
            icon={HardDrive}
            label={t("ov.storageSize")}
            value={formatBytes(data.totalStorageSize)}
          />
          <StatCard
            icon={Cpu}
            label={t("ov.memory")}
            value={`${data.memResidentMb} MB`}
            sub={`${data.memVirtualMb} MB ${t("ov.virtual")}`}
          />
          <StatCard
            icon={Network}
            label={t("ov.network")}
            value={formatBytes(data.networkBytesIn)}
            sub={`${formatBytes(data.networkBytesOut)} ${t("ov.out")}`}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ov.operations")}
            </h3>
            <Bars
              data={Object.entries(data.opcounters).map(([label, value]) => ({
                label,
                value,
                render: formatCount(value),
              }))}
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ov.dbsBySize")}
            </h3>
            <Bars
              data={[...data.databases]
                .sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
                .map((d) => ({
                  label: d.name,
                  value: d.sizeOnDisk,
                  render: formatBytes(d.sizeOnDisk),
                }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
