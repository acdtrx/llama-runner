// Minimal Prometheus text-format parser, scoped to llama.cpp's output.
// Skips HELP/TYPE comment lines and label-free metric lines. Labeled metrics
// are parsed with labels dropped (name only), which is sufficient for
// llama.cpp's current counters.

export function parsePrometheusText(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    // name{labels} value  |  name value
    const braceIdx = line.indexOf('{');
    let name: string;
    let rest: string;
    if (braceIdx >= 0) {
      const closeIdx = line.indexOf('}', braceIdx);
      if (closeIdx < 0) continue;
      name = line.slice(0, braceIdx);
      rest = line.slice(closeIdx + 1).trim();
    } else {
      const sp = line.indexOf(' ');
      if (sp < 0) continue;
      name = line.slice(0, sp);
      rest = line.slice(sp + 1).trim();
    }
    const valuePart = rest.split(/\s+/)[0];
    if (!valuePart) continue;
    const value = Number.parseFloat(valuePart);
    if (!Number.isFinite(value)) continue;
    out[name] = value;
  }
  return out;
}
