import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Vibrant, brand-aligned syntax highlighting. Two variants tuned for contrast:
 * the dark one is bright on the near-black canvas; the light one uses deeper
 * shades so tokens (and `db`, punctuation, etc.) stay legible on white.
 */
export const tucanoHighlightDark = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#2ec4d6", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#f0b429" },
  { tag: [t.number, t.integer, t.float], color: "#ff8a5b" },
  { tag: [t.bool, t.null, t.atom], color: "#b794f6", fontWeight: "600" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#5fb3e6" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#2ee6c5" },
  { tag: [t.className, t.typeName, t.namespace], color: "#7ee0a0" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#dbe3ee" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.brace, t.squareBracket, t.paren], color: "#9aa4b6" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#697086", fontStyle: "italic" },
  { tag: t.invalid, color: "#ff6b6b" },
]);

export const tucanoHighlightLight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#0e7490", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#b45309" },
  { tag: [t.number, t.integer, t.float], color: "#c2410c" },
  { tag: [t.bool, t.null, t.atom], color: "#7c3aed", fontWeight: "600" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#0369a1" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#0d9488" },
  { tag: [t.className, t.typeName, t.namespace], color: "#047857" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#334155" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.brace, t.squareBracket, t.paren], color: "#64748b" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#94a3b8", fontStyle: "italic" },
  { tag: t.invalid, color: "#dc2626" },
]);
