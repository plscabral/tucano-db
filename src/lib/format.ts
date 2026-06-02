// Date formatting honoring the app settings (timezone + display mode).

import type { AppSettings } from "./types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

type DateOpts = Pick<AppSettings, "timezone" | "dateMode" | "dateFormat">;

/** Offset in minutes for a timezone setting; null means use the local zone. */
function offsetMinutes(tz: string): number | null {
  if (tz === "local") return null;
  if (tz === "UTC") return 0;
  const m = tz.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

function offLabel(min: number): string {
  if (min === 0) return "Z";
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "-"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

type Parts = { Y: number; Mo: number; Da: number; H: number; Mi: number; S: number; Ms: number; off: number };

function parts(ms: number, tz: string): Parts {
  const off = offsetMinutes(tz);
  if (off === null) {
    const d = new Date(ms);
    return {
      Y: d.getFullYear(),
      Mo: d.getMonth() + 1,
      Da: d.getDate(),
      H: d.getHours(),
      Mi: d.getMinutes(),
      S: d.getSeconds(),
      Ms: d.getMilliseconds(),
      off: -d.getTimezoneOffset(),
    };
  }
  const d = new Date(ms + off * 60000);
  return {
    Y: d.getUTCFullYear(),
    Mo: d.getUTCMonth() + 1,
    Da: d.getUTCDate(),
    H: d.getUTCHours(),
    Mi: d.getUTCMinutes(),
    S: d.getUTCSeconds(),
    Ms: d.getUTCMilliseconds(),
    off,
  };
}

/** Format an epoch-ms timestamp honoring the timezone + display mode settings. */
export function formatDate(ms: number, s: DateOpts): string {
  const p = parts(ms, s.timezone);

  if (s.dateMode === "iso") {
    return `${p.Y}-${pad(p.Mo)}-${pad(p.Da)}T${pad(p.H)}:${pad(p.Mi)}:${pad(p.S)}.${pad(p.Ms, 3)}${offLabel(p.off)}`;
  }

  if (s.dateMode === "locale") {
    const off = offsetMinutes(s.timezone);
    if (off === null) return new Date(ms).toLocaleString();
    return new Date(ms + off * 60000).toLocaleString(undefined, { timeZone: "UTC" });
  }

  // custom token format
  return (s.dateFormat || "YYYY-MM-DD HH:mm:ss")
    .replace(/YYYY/g, String(p.Y))
    .replace(/MM/g, pad(p.Mo))
    .replace(/DD/g, pad(p.Da))
    .replace(/HH/g, pad(p.H))
    .replace(/mm/g, pad(p.Mi))
    .replace(/ss/g, pad(p.S))
    .replace(/SSS/g, pad(p.Ms, 3));
}

/** Relative "time ago" for history timestamps. */
export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
