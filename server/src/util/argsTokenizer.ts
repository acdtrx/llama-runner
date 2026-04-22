// Minimal shell-style tokenizer for profile CLI arguments.
// Supports: whitespace split, single/double quoted strings (quotes stripped).
// Does NOT interpret: backslash escapes, variable expansion, subshells, globs.
// Unclosed quote throws.

export function tokenizeArgs(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    while (i < n && isWs(line[i]!)) i += 1;
    if (i >= n) break;

    let token = '';
    while (i < n && !isWs(line[i]!)) {
      const ch = line[i]!;
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i += 1;
        while (i < n && line[i] !== quote) {
          token += line[i]!;
          i += 1;
        }
        if (i >= n) throw new Error(`unclosed ${quote} in args`);
        i += 1; // consume closing quote
      } else {
        token += ch;
        i += 1;
      }
    }
    out.push(token);
  }
  return out;
}

// For reserved-flag detection: flag names can appear as `--foo` or `--foo=bar`.
export function flagName(token: string): string {
  if (!token.startsWith('-')) return token;
  const eq = token.indexOf('=');
  return eq > 0 ? token.slice(0, eq) : token;
}

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}
