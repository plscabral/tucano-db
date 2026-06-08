// Date formatting honoring the app settings (timezone + display mode).

import type { AppSettings } from "./types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

type DateOpts = Pick<AppSettings, "timezone" | "dateMode" | "dateFormat"> &
  Partial<Pick<AppSettings, "language">>;

/** BCP-47 locale tag for the app language (used by locale + custom name tokens). */
function localeTag(lang: AppSettings["language"] | undefined): string | undefined {
  return lang ?? undefined;
}

/** Signed timezone offset, e.g. `-03:00` (colon) or `-0300`. */
function fmtOffset(min: number, colon: boolean): string {
  const a = Math.abs(min);
  const sign = min < 0 ? "-" : "+";
  const hm = `${pad(Math.floor(a / 60))}${colon ? ":" : ""}${pad(a % 60)}`;
  return `${sign}${hm}`;
}

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

/** Tokens recognized by the custom date format, longest-first for one-pass replace. */
const DATE_TOKEN = /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z/g;

/** Localized month / weekday names for the instant `ms` in the chosen zone. */
function localeNames(ms: number, tz: string, lang: AppSettings["language"] | undefined) {
  const off = offsetMinutes(tz);
  const d = off === null ? new Date(ms) : new Date(ms + off * 60000);
  const opts: Intl.DateTimeFormatOptions = off === null ? {} : { timeZone: "UTC" };
  const tag = localeTag(lang);
  const name = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(tag, { ...opts, ...o });
  return {
    MMMM: name({ month: "long" }),
    MMM: name({ month: "short" }),
    dddd: name({ weekday: "long" }),
    ddd: name({ weekday: "short" }),
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
    const tag = localeTag(s.language);
    if (off === null) return new Date(ms).toLocaleString(tag);
    return new Date(ms + off * 60000).toLocaleString(tag, { timeZone: "UTC" });
  }

  // Custom token format. Single pass so substituted names (e.g. a month name
  // containing token letters) aren't re-replaced; `[literal]` escapes text.
  const names = localeNames(ms, s.timezone, s.language);
  const h12 = p.H % 12 || 12;
  const map: Record<string, string> = {
    YYYY: String(p.Y),
    YY: pad(p.Y % 100),
    MMMM: names.MMMM,
    MMM: names.MMM,
    MM: pad(p.Mo),
    M: String(p.Mo),
    DD: pad(p.Da),
    D: String(p.Da),
    dddd: names.dddd,
    ddd: names.ddd,
    HH: pad(p.H),
    H: String(p.H),
    hh: pad(h12),
    h: String(h12),
    mm: pad(p.Mi),
    m: String(p.Mi),
    ss: pad(p.S),
    s: String(p.S),
    SSS: pad(p.Ms, 3),
    A: p.H < 12 ? "AM" : "PM",
    a: p.H < 12 ? "am" : "pm",
    ZZ: fmtOffset(p.off, false),
    Z: fmtOffset(p.off, true),
  };
  return (s.dateFormat || "DD/MM/YYYY HH:mm:ss")
    .split(/(\[[^\]]*\])/)
    .map((seg) =>
      seg.startsWith("[") && seg.endsWith("]")
        ? seg.slice(1, -1)
        : seg.replace(DATE_TOKEN, (tok) => map[tok] ?? tok)
    )
    .join("");
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
