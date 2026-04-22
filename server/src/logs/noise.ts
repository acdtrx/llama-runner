// Known-verbose prefixes from llama-server's slot update_slots machinery.
// Lines matching any of these are still parsed for metrics, and still written
// to raw.log, but carry `noise: true` so the UI can hide them by default.
// Source: docs/05-metrics.md.

const PREFIXES = [
  'Checking checkpoint with ',
  'erased invalidated context checkpoint',
  'created context checkpoint ',
  'restored context checkpoint ',
  'tokens since last checkpoint at ',
  'prompt processing progress, n_tokens = ',
];

const CONTAINS = [' memory_seq_rm '];

const REGEXES: RegExp[] = [
  /^srv\s+update:\s+-\s+prompt\s+0x/,
];

export function isNoisy(line: string): boolean {
  for (const prefix of PREFIXES) {
    if (line.includes(prefix)) return true;
  }
  for (const substr of CONTAINS) {
    if (line.includes(substr)) return true;
  }
  for (const re of REGEXES) {
    if (re.test(line)) return true;
  }
  return false;
}
