// Mirrors server/src/logs/noise.ts. Kept in sync by hand; the patterns come
// from docs/05-metrics.md.

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
  /^srv\s+log_server_r:\s+done request:\s+GET\s+\/(slots|metrics|props|health)\b/,
  /^srv\s+stop:\s+cancel task,\s+id_task\s*=/,
];

export function isNoisy(line: string): boolean {
  for (const prefix of PREFIXES) if (line.includes(prefix)) return true;
  for (const substr of CONTAINS) if (line.includes(substr)) return true;
  for (const re of REGEXES) if (re.test(line)) return true;
  return false;
}
