import { useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  Copy,
  Database,
  Download,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  RotateCw,
  Shapes,
  Sun,
  X,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettings } from "@/stores/settings";
import { useTheme, setTheme, type ThemeMode } from "@/stores/theme";
import { useUpdater } from "@/stores/updater";
import { ipc } from "@/lib/ipc";
import { useT, useI18n } from "@/lib/i18n";
import { TYPE_COLOR, TYPE_LABEL, type BsonType } from "@/lib/bsonTypes";
import { LogoMark } from "@/components/Logo";
import type { DateMode, ExportFormat, Language, McpSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

const LOCALES: { id: Language; flag: string; label: string }[] = [
  { id: "en", flag: "🇺🇸", label: "English" },
  { id: "pt-BR", flag: "🇧🇷", label: "Português (BR)" },
  { id: "es", flag: "🇪🇸", label: "Español" },
];

const TIMEZONES = [
  "local",
  "-12:00", "-11:00", "-10:00", "-09:30", "-09:00", "-08:00", "-07:00", "-06:00",
  "-05:00", "-04:30", "-04:00", "-03:30", "-03:00", "-02:00", "-01:00",
  "UTC",
  "+01:00", "+02:00", "+03:00", "+03:30", "+04:00", "+04:30", "+05:00", "+05:30",
  "+05:45", "+06:00", "+06:30", "+07:00", "+08:00", "+08:45", "+09:00", "+09:30",
  "+10:00", "+10:30", "+11:00", "+11:30", "+12:00", "+12:45", "+13:00", "+14:00",
];

const SHORTCUTS: [string, string][] = [
  [`${MOD} + ↵`, "Run the active query"],
  [`${MOD} + ,`, "Open settings"],
  ["Right click", "Document / collection actions"],
  ["Tab", "Accept autocomplete"],
];

type TabId = "appearance" | "data" | "mcp" | "types" | "shortcuts" | "about";

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<TabId>("appearance");

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const NAV: { label: string; items: { id: TabId; icon: React.ReactNode; label: string }[] }[] = [
    {
      label: t("set.group.general"),
      items: [
        { id: "appearance", icon: <Palette size={14} />, label: t("set.appearance") },
        { id: "data", icon: <Database size={14} />, label: t("set.data") },
      ],
    },
    { label: t("set.group.integrations"), items: [{ id: "mcp", icon: <Bot size={14} />, label: "MCP" }] },
    {
      label: t("set.group.reference"),
      items: [
        { id: "types", icon: <Shapes size={14} />, label: t("set.types") },
        { id: "shortcuts", icon: <Keyboard size={14} />, label: t("set.shortcuts") },
      ],
    },
    { label: t("set.group.about"), items: [{ id: "about", icon: <Info size={14} />, label: t("set.about") }] },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[680px] max-h-[88vh] w-[920px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-border bg-[var(--tcn-canvas)] text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 overflow-hidden border-b border-border">
          <div className="tcn-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="tcn-glow-radial pointer-events-none absolute inset-0" />
          <div className="relative flex h-16 items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <div className="tcn-sheen grid h-9 w-9 place-items-center rounded-xl shadow-soft ring-1 ring-inset ring-ink-200/50 dark:ring-white/10">
                <LogoMark className="h-5 w-5" />
              </div>
              <div className="leading-none">
                <div className="text-base font-bold tracking-tight">{t("settings.title")}</div>
                <div className="mt-1.5 text-[11px] opacity-50">
                  Tucano <span className="font-accent">DB</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg opacity-70 transition hover:bg-accent hover:opacity-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-52 shrink-0 flex-col gap-4 overflow-auto border-r border-border px-2 py-3 scroll-thin">
            {NAV.map((g) => (
              <div key={g.label} className="flex flex-col gap-0.5">
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-40">
                  {g.label}
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setTab(it.id)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs transition",
                      tab === it.id
                        ? "tcn-accent-soft font-semibold text-tucano-700 dark:text-tucano-300 ring-1 ring-inset ring-tucano-400/25"
                        : "opacity-75 hover:bg-accent hover:opacity-100"
                    )}
                  >
                    <span className={tab === it.id ? "" : "opacity-80"}>{it.icon}</span>
                    <span className="truncate">{it.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-auto scroll-thin">
            {tab === "appearance" && <AppearanceTab />}
            {tab === "data" && <DataTab />}
            {tab === "mcp" && <McpTab />}
            {tab === "types" && <TypesTab />}
            {tab === "shortcuts" && <ShortcutsTab />}
            {tab === "about" && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 last:border-0">
      <div className="flex items-center gap-2 text-tucano-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{title}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed opacity-60">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-tucano-400" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function NumberInput({ value, onChange, width = "w-28" }: { value: number; onChange: (n: number) => void; width?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.currentTarget.value) || 0)}
      className={cn("mono h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-tucano-400", width)}
    />
  );
}

function TextInput({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cn("mono h-9 rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-tucano-400", rest.className)}
    />
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

function AppearanceTab() {
  const t = useT();
  const mode = useTheme((s) => s.mode);
  const lang = useI18n((s) => s.lang);
  const update = useSettings((s) => s.update);

  const ThemeOpt = ({ m, icon, label }: { m: ThemeMode; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setTheme(m)}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs transition",
        mode === m ? "bg-background text-tucano-400 shadow-sm" : "opacity-70 hover:opacity-100"
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <Section icon={<Sun size={14} />} title={t("set.appearance")}>
      <Row title={t("set.theme")}>
        <div className="flex w-[320px] gap-1 rounded-xl bg-muted p-1">
          <ThemeOpt m="light" icon={<Sun size={13} />} label={t("set.themeLight")} />
          <ThemeOpt m="dark" icon={<Moon size={13} />} label={t("set.themeDark")} />
          <ThemeOpt m="system" icon={<Monitor size={13} />} label={t("set.themeSystem")} />
        </div>
      </Row>
      <Row title={t("set.language")}>
        <div className="relative w-[320px]">
          <select
            value={lang}
            onChange={(e) => update({ language: e.currentTarget.value as Language })}
            className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-input bg-muted pl-3.5 pr-9 text-xs outline-none transition hover:border-tucano-400/60 focus:border-tucano-400"
          >
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.flag}  {l.label}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
        </div>
      </Row>
    </Section>
  );
}

function DataTab() {
  const t = useT();
  const { settings, update } = useSettings();
  return (
    <Section icon={<Database size={14} />} title={t("set.data")}>
      <Row title={t("set.timezone")}>
        <div className="relative w-44">
          <select
            value={settings.timezone}
            onChange={(e) => update({ timezone: e.currentTarget.value })}
            className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-input bg-muted pl-3 pr-9 text-xs outline-none transition hover:border-tucano-400/60 focus:border-tucano-400"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz === "local" ? "Local" : tz}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
        </div>
      </Row>
      <Row title={t("set.dateFormat")}>
        <div className="relative w-44">
          <select
            value={settings.dateMode}
            onChange={(e) => update({ dateMode: e.currentTarget.value as DateMode })}
            className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-input bg-muted pl-3 pr-9 text-xs outline-none transition hover:border-tucano-400/60 focus:border-tucano-400"
          >
            <option value="iso">ISO Date Format</option>
            <option value="locale">Default Locale</option>
            <option value="custom">Custom</option>
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
        </div>
      </Row>
      {settings.dateMode === "custom" && (
        <Row title="Custom format" hint="Tokens: YYYY MM DD HH mm ss SSS">
          <TextInput value={settings.dateFormat} onChange={(v) => update({ dateFormat: v })} className="w-44" />
        </Row>
      )}
      <Row title={t("set.pageSize")}>
        <NumberInput value={settings.defaultPageSize} onChange={(n) => update({ defaultPageSize: Math.max(1, n) })} width="w-24" />
      </Row>
      <Row title={t("set.autoExecute")} hint={t("set.autoExecuteHint")}>
        <Toggle checked={settings.autoExecute} onChange={(v) => update({ autoExecute: v })} />
      </Row>
      <Row title={t("set.initialScript")} hint={t("set.initialScriptHint")}>
        <TextInput
          value={settings.initialScript}
          onChange={(v) => update({ initialScript: v })}
          placeholder="db.{coll}.find({})"
          className="w-64"
        />
      </Row>
      <Row title={t("set.recordDeletes")} hint={t("set.historyHint")}>
        <Toggle checked={settings.recordDeletes} onChange={(v) => update({ recordDeletes: v })} />
      </Row>
      <Row title={t("set.recordUpdates")}>
        <Toggle checked={settings.recordUpdates} onChange={(v) => update({ recordUpdates: v })} />
      </Row>
      <Row title={t("set.exportFormat")}>
        <div className="relative w-32">
          <select
            value={settings.exportFormat}
            onChange={(e) => update({ exportFormat: e.currentTarget.value as ExportFormat })}
            className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-input bg-muted pl-3 pr-9 text-xs outline-none transition hover:border-tucano-400/60 focus:border-tucano-400"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
        </div>
      </Row>
    </Section>
  );
}

function McpTab() {
  const t = useT();
  const [mcp, setMcp] = useState<McpSettings | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string; installed: boolean; configPath: string }[]>([]);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState<"" | "token" | "config">("");

  const reloadClients = () => ipc.listMcpClients().then(setClients).catch(() => setClients([]));
  useEffect(() => {
    ipc.getMcpSettings().then(setMcp).catch(() => {});
    reloadClients();
  }, []);
  if (!mcp) return null;

  const save = (patch: Partial<McpSettings>) => {
    const next = { ...mcp, ...patch };
    setMcp(next);
    ipc.setMcpSettings(next).catch(() => {});
    window.dispatchEvent(new Event("tucano:mcp-changed"));
  };
  const rotate = async () => {
    const token = await ipc.rotateMcpToken();
    setMcp({ ...mcp, token });
    window.dispatchEvent(new Event("tucano:mcp-changed"));
  };
  const snippet = (real: boolean) =>
    JSON.stringify(
      {
        mcpServers: {
          "tucano-db": {
            command: "npx",
            args: ["-y", "tucano-db-mcp"],
            env: {
              TUCANO_DB_BRIDGE: `http://127.0.0.1:${mcp.port}`,
              TUCANO_DB_TOKEN: real || tokenVisible ? mcp.token : "•".repeat(mcp.token.length),
            },
          },
        },
      },
      null,
      2
    );
  const copy = async (kind: "token" | "config") => {
    await navigator.clipboard.writeText(kind === "token" ? mcp.token : snippet(true));
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <>
      <Section icon={<Bot size={14} />} title={t("set.mcp.bridge")}>
        <p className="text-xs leading-relaxed opacity-70">{t("set.mcp.bridgeHint")}</p>
        <Row title={t("set.mcp.enable")}>
          <Toggle checked={mcp.enabled} onChange={(v) => save({ enabled: v })} />
        </Row>
        <div className="flex items-center gap-3">
          <label className="w-14 text-xs opacity-70">{t("set.mcp.port")}</label>
          <NumberInput value={mcp.port} onChange={(n) => save({ port: n || mcp.port })} />
        </div>
        <div>
          <div className="mono mb-1 text-[11px] uppercase tracking-wider opacity-60">{t("set.mcp.token")}</div>
          <div className="flex items-center gap-2">
            <input
              type={tokenVisible ? "text" : "password"}
              readOnly
              value={mcp.token}
              className="mono h-9 flex-1 rounded-xl border border-input bg-background px-3 text-xs outline-none"
            />
            <button onClick={() => setTokenVisible(!tokenVisible)} className="h-9 rounded-xl border border-input px-3 text-xs hover:border-tucano-400/60">
              {tokenVisible ? t("set.mcp.hide") : t("set.mcp.show")}
            </button>
            <button
              onClick={() => copy("token")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs transition",
                copied === "token" ? "border-emerald-500/40 text-emerald-500" : "border-input hover:border-tucano-400/60"
              )}
            >
              <Copy size={13} /> {copied === "token" ? t("set.copied") : t("set.copy")}
            </button>
            <button onClick={rotate} className="flex h-9 items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10">
              <RotateCw size={13} /> {t("set.mcp.rotate")}
            </button>
          </div>
        </div>
      </Section>

      <Section icon={<Plug size={14} />} title={t("set.mcp.installTitle")}>
        <p className="text-xs leading-relaxed opacity-70">{t("set.mcp.installHint")}</p>
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {c.installed && (
                    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">
                      {t("set.mcp.installed")}
                    </span>
                  )}
                </div>
                <div className="mono truncate text-[11px] opacity-60">{c.configPath}</div>
              </div>
              {c.installed ? (
                <button
                  onClick={async () => {
                    await ipc.uninstallMcpClient(c.id);
                    reloadClients();
                  }}
                  className="h-8 rounded-lg border border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10"
                >
                  {t("set.mcp.remove")}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await ipc.installMcpClient(c.id);
                    reloadClients();
                  }}
                  className="tcn-accent tcn-accent-glow h-8 rounded-lg px-3 text-xs"
                >
                  {t("set.mcp.install")}
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={reloadClients} className="flex h-8 items-center gap-1.5 self-start rounded-lg border border-input px-3 text-xs hover:border-tucano-400/60">
          <RefreshCw size={12} /> {t("set.mcp.refresh")}
        </button>
      </Section>

      <Section icon={<Info size={14} />} title={t("set.mcp.configTitle")}>
        <p className="text-xs leading-relaxed opacity-70">{t("set.mcp.configHint")}</p>
        <div className="relative">
          <pre className="mono overflow-auto whitespace-pre rounded-xl border border-border bg-muted p-3 text-[11px]">{snippet(false)}</pre>
          <button
            onClick={() => copy("config")}
            className={cn(
              "absolute right-2 top-2 flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition",
              copied === "config" ? "border-emerald-500/40 text-emerald-500" : "border-input bg-background hover:border-tucano-400/60"
            )}
          >
            <Copy size={11} /> {copied === "config" ? t("set.copied") : t("set.copy")}
          </button>
        </div>
      </Section>
    </>
  );
}

function TypesTab() {
  const t = useT();
  const types = Object.keys(TYPE_LABEL) as BsonType[];
  return (
    <Section icon={<Shapes size={14} />} title={t("set.types")}>
      <p className="text-xs leading-relaxed opacity-70">{t("set.typesHint")}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {types.map((ty) => (
          <div key={ty} className="flex items-center gap-2.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", TYPE_COLOR[ty].replace("text-", "bg-"))} />
            <span className="font-medium">{TYPE_LABEL[ty]}</span>
            <span className={cn("mono ml-auto text-[11px]", TYPE_COLOR[ty])}>{ty}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ShortcutsTab() {
  const t = useT();
  return (
    <Section icon={<Keyboard size={14} />} title={t("set.shortcuts")}>
      <div className="grid grid-cols-1 gap-y-1.5 text-xs">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <span className="opacity-70">{v}</span>
            <kbd className="mono rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">{k}</kbd>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AboutTab() {
  const t = useT();
  const [version, setVersion] = useState("");
  const { state, version: newVersion, progress, error, notes, check, download, restart } = useUpdater();

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const statusText: Record<string, string> = {
    idle: t("upd.idle"),
    checking: t("upd.checking"),
    available: `${t("upd.available")} v${newVersion}`,
    downloading: `${t("upd.downloading")} ${Math.round(progress * 100)}%`,
    ready: `${t("upd.ready")} v${newVersion}`,
    upToDate: t("upd.upToDate"),
    error: t("upd.error"),
  };

  return (
    <Section icon={<RefreshCw size={14} />} title={t("set.about")}>
      <div className="flex flex-col gap-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="opacity-70">{t("set.currentVersion")}</span>
          <span className="mono">{version || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="opacity-70">{t("set.updateStatus")}</span>
          <span className="mono opacity-80">{statusText[state]}</span>
        </div>
        {state === "error" && error && <div className="mono break-all text-[11px] opacity-60">{error}</div>}
        <div className="flex gap-2 pt-1">
          {state === "available" ? (
            <button onClick={() => download()} className="tcn-accent tcn-accent-glow h-8 rounded-lg px-3 text-xs">
              {t("set.downloadUpdate")}
            </button>
          ) : state === "ready" ? (
            <button onClick={() => restart()} className="tcn-accent tcn-accent-glow h-8 rounded-lg px-3 text-xs">
              {t("upd.restart")}
            </button>
          ) : (
            <button
              onClick={() => check()}
              disabled={state === "checking" || state === "downloading"}
              className="h-8 rounded-lg bg-muted px-3 text-xs hover:bg-accent disabled:opacity-50"
            >
              {t("set.checkUpdates")}
            </button>
          )}
        </div>
        {notes && <pre className="whitespace-pre-wrap pt-1 font-sans text-[11px] leading-relaxed opacity-70">{notes}</pre>}
      </div>
    </Section>
  );
}
