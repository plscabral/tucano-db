/** Conservative detection for fields that are likely to contain renderable HTML. */
export function isHtmlContent(value: unknown): value is string {
  return typeof value === "string" && /<!doctype\s+html|<html[\s>]|<body[\s>]|<(?:div|table|p|section|article|span|h[1-6])(?:\s|>)/i.test(value);
}

/**
 * Build a complete, isolated preview document. The caller renders this only in
 * a sandboxed iframe; its CSP prevents a stored email/document from loading
 * remote content or running active code.
 */
export function sandboxedHtmlDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>html{color-scheme:light}body{margin:0;padding:20px;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
