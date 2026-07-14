import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { BookOpen, Check, Clipboard, FileSearch, ShieldCheck, TerminalSquare, X } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useAiTerminal } from "@/stores/aiTerminal";
import { useEffectiveTheme } from "@/stores/theme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const terminalTheme = (mode: "dark" | "light") => {
  const dark = mode === "dark";
  return {
    // Exact values of `--tcn-canvas`, the app shell background in each theme.
    background: dark ? "#0F1014" : "#FFFFFF",
    foreground: dark ? "hsl(0 0% 96%)" : "hsl(224 48% 10%)",
    cursor: "#17b6c7",
    selectionBackground: dark ? "rgba(26, 150, 173, 0.32)" : "rgba(26, 150, 173, 0.22)",
    black: dark ? "#0F1014" : "#FFFFFF",
    red: dark ? "#fb7185" : "#be123c",
    green: dark ? "#4ade80" : "#15803d",
    yellow: dark ? "#facc15" : "#a16207",
    blue: dark ? "#60a5fa" : "#1d4ed8",
    magenta: dark ? "#c084fc" : "#7e22ce",
    cyan: dark ? "#22d3ee" : "#0e7490",
    white: dark ? "#d9e2e8" : "#1e293b",
    brightBlack: dark ? "#94a3b8" : "#64748b",
    brightRed: dark ? "#fda4af" : "#e11d48",
    brightGreen: dark ? "#86efac" : "#16a34a",
    brightYellow: dark ? "#fde047" : "#ca8a04",
    brightBlue: dark ? "#93c5fd" : "#2563eb",
    brightMagenta: dark ? "#d8b4fe" : "#9333ea",
    brightCyan: dark ? "#67e8f9" : "#0891b2",
    brightWhite: dark ? "#f8fafc" : "#0f172a",
  };
};

export function AiTerminal() {
  const open = useAiTerminal((state) => state.open);
  const close = useAiTerminal((state) => state.close);
  const theme = useEffectiveTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<string | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("tucano-db:ai-terminal-width"));
    return Number.isFinite(saved) ? Math.max(420, saved) : 720;
  });

  useEffect(() => {
    if (!open || !hostRef.current) return;
    let disposed = false;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      theme: terminalTheme(theme),
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    terminalRef.current = terminal;

    const syncDimensions = () => {
      if (disposed || !hostRef.current || hostRef.current.clientWidth === 0 || hostRef.current.clientHeight === 0) return;
      fit.fit();
      if (sessionRef.current) void ipc.resizeAiTerminal(sessionRef.current, terminal.cols, terminal.rows);
    };
    const resize = () => requestAnimationFrame(syncDimensions);
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);
    // xterm measures after layout and again after the monospace web font is
    // available. This keeps full-screen CLIs in the exact PTY grid they draw.
    requestAnimationFrame(() => requestAnimationFrame(syncDimensions));
    const fontReady = document.fonts?.ready.then(syncDimensions);
    const delayedSync = window.setTimeout(syncDimensions, 150);

    const input = terminal.onData((data) => {
      if (sessionRef.current) void ipc.writeAiTerminal(sessionRef.current, data);
    });
    let unlisten: (() => void) | undefined;
    void listen<{ sessionId: string; data: string }>("tucano://terminal-output", (event) => {
      if (event.payload.sessionId === sessionRef.current) terminal.write(event.payload.data);
    }).then((dispose) => { unlisten = dispose; });

    if (!sessionRef.current) {
      void ipc.startAiTerminal(terminal.cols, terminal.rows)
        .then((session) => {
          if (disposed) {
            void ipc.stopAiTerminal(session);
            return;
          }
          sessionRef.current = session;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!disposed) {
              syncDimensions();
              void ipc.resizeAiTerminal(session, terminal.cols, terminal.rows);
            }
          }));
          terminal.focus();
        })
        .catch((cause) => setError(String(cause)));
    } else {
      terminal.focus();
      void ipc.resizeAiTerminal(sessionRef.current, terminal.cols, terminal.rows);
    }

    return () => {
      disposed = true;
      window.clearTimeout(delayedSync);
      observer.disconnect();
      input.dispose();
      unlisten?.();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(theme);
  }, [theme]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 900) return;
    event.preventDefault();
    resizeStartRef.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const maxWidth = Math.max(420, window.innerWidth - 320);
    setPanelWidth(Math.min(maxWidth, Math.max(420, start.width + start.x - event.clientX)));
  };

  const finishResize = () => {
    resizeStartRef.current = null;
    window.localStorage.setItem("tucano-db:ai-terminal-width", String(panelWidth));
  };

  const copyPrompt = async (label: string, prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(label);
    window.setTimeout(() => setCopiedPrompt(null), 1_600);
  };

  if (!open) return null;

  return (
    <aside
      aria-label="Terminal"
      style={{ "--ai-terminal-width": `${panelWidth}px` } as React.CSSProperties}
      className="ai-terminal-panel relative flex min-w-[26rem] shrink-0 flex-col overflow-hidden border-l border-border shadow-[-16px_0_32px_-28px_rgba(0,0,0,0.55)] max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-30 max-[900px]:min-w-0"
    >
      <div aria-label="Resize terminal" role="separator" aria-orientation="vertical" onPointerDown={startResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} className="ai-terminal-resize absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none" />
      <header className="ai-terminal-header flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-foreground">
        <TerminalSquare className="h-4 w-4 text-tucano-400" />
        <h2 className="text-sm font-semibold">Terminal</h2>
        <Popover>
          <PopoverTrigger asChild>
            <button aria-label="What can the AI do?" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <BookOpen className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-[23rem] p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Tucano AI, por onde começar</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">No terminal, rode <code className="mono rounded bg-muted px-1 py-0.5 text-[11px]">claude</code> e descreva o que precisa. O Copilot abre consultas no editor e mostra o resultado.</p>
            </div>
            <div className="divide-y divide-border">
              <PromptGuide label="Consultar dados" icon={<FileSearch className="h-3.5 w-3.5" />} prompt="No banco Pertly, abra a coleção Person e filtre pessoas cujo campo Name contenha Alexandre. Execute a consulta no editor do Tucano." onCopy={copyPrompt} copied={copiedPrompt} />
              <PromptGuide label="Entender schema e índices" icon={<TerminalSquare className="h-3.5 w-3.5" />} prompt="Analise o schema e os índices da coleção Person. Explique campos, cobertura e oportunidades de performance." onCopy={copyPrompt} copied={copiedPrompt} />
              <PromptGuide label="Montar um relatório" icon={<Clipboard className="h-3.5 w-3.5" />} prompt="Crie um relatório resumido da coleção Person: total de documentos, campos mais preenchidos, valores ausentes e observações sobre os índices." onCopy={copyPrompt} copied={copiedPrompt} />
              <div className="flex gap-2 px-4 py-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p><span className="font-medium text-foreground">Alterações são sempre propostas.</span> Para criar, editar ou apagar, o Copilot explica impacto e pede confirmação, sem executar a mudança.</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <span className="ml-auto text-[11px] text-muted-foreground">Tucano workspace</span>
        <button aria-label="Close terminal" onClick={close} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </header>
      {error && <div className="m-3 shrink-0 mono break-all rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      <div ref={hostRef} className="ai-terminal-host min-h-0 flex-1 overflow-hidden" />
    </aside>
  );
}

function PromptGuide({
  label,
  icon,
  prompt,
  copied,
  onCopy,
}: {
  label: string;
  icon: React.ReactNode;
  prompt: string;
  copied: string | null;
  onCopy: (label: string, prompt: string) => void;
}) {
  const done = copied === label;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-tucano-600 dark:text-tucano-300">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{prompt}</p>
      </div>
      <button onClick={() => void onCopy(label, prompt)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground" title="Copy prompt">
        {done ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
