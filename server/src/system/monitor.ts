import { execFile as execFileCb } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { cpus, freemem, platform, totalmem } from 'node:os';
import { promisify } from 'node:util';

import { readSettings } from '../config/settings.js';
import { llamaServer } from '../process/llamaServer.js';
import { bus } from '../sse/bus.js';

// Node has no built-in API for per-PID CPU/RSS, so we shell out to `ps`.
// For system memory we use OS-native sources: `vm_stat` on macOS and
// /proc/meminfo on Linux — both give a realistic "app-occupied" figure that
// os.freemem() alone cannot produce (it counts reclaimable cache as used).
const execFile = promisify(execFileCb);

const FALLBACK_INTERVAL_MS = 1000;

export interface SystemStatsPayload {
  at: string;
  system: {
    cpuPercent: number;
    cpuCores: number;
    memTotalMiB: number;
    memUsedMiB: number;
  };
  process: {
    pid: number;
    cpuPercent: number;
    rssMiB: number;
  } | null;
}

interface CpuSample {
  busy: number;
  total: number;
}

function sampleCpuTimes(): CpuSample {
  let busy = 0;
  let total = 0;
  for (const core of cpus()) {
    const t = core.times;
    const coreTotal = t.user + t.nice + t.sys + t.idle + t.irq;
    busy += coreTotal - t.idle;
    total += coreTotal;
  }
  return { busy, total };
}

async function sampleProcessUsage(
  pid: number,
): Promise<{ cpuPercent: number; rssMiB: number } | null> {
  try {
    const { stdout } = await execFile('ps', ['-o', '%cpu=,rss=', '-p', String(pid)]);
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    const cpu = Number.parseFloat(parts[0] ?? '');
    const rssKiB = Number.parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(cpu) || Number.isNaN(rssKiB)) return null;
    return { cpuPercent: cpu, rssMiB: rssKiB / 1024 };
  } catch {
    // Process exited between the status check and the ps call.
    return null;
  }
}

async function sampleMemoryDarwin(totalMiB: number): Promise<{ totalMiB: number; usedMiB: number }> {
  // vm_stat exposes the page buckets we need for a realistic "app-occupied"
  // number: active + wired + compressor. Inactive/purgeable are treated as
  // available (os.freemem() omits them, so "total - free" overstates use).
  const { stdout } = await execFile('vm_stat');
  const pageSizeMatch = stdout.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch?.[1] ? Number.parseInt(pageSizeMatch[1], 10) : 16384;
  const pages = (key: string): number => {
    const m = stdout.match(new RegExp(`${key}[^:]*:\\s+(\\d+)`));
    return m?.[1] ? Number.parseInt(m[1], 10) : 0;
  };
  const active = pages('Pages active');
  const wired = pages('Pages wired down');
  const compressed = pages('Pages occupied by compressor');
  const usedMiB = ((active + wired + compressed) * pageSize) / (1024 * 1024);
  return { totalMiB, usedMiB };
}

async function sampleMemoryLinux(totalMiB: number): Promise<{ totalMiB: number; usedMiB: number }> {
  // MemAvailable is the kernel's own estimate of memory that can be given to
  // a new workload without swapping — the Linux analogue of (total - active -
  // wired - compressed) on macOS. It excludes reclaimable buffers/cache.
  const meminfo = await readFile('/proc/meminfo', 'utf8');
  const kib = (key: string): number | null => {
    const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm'));
    return m?.[1] ? Number.parseInt(m[1], 10) : null;
  };
  const available = kib('MemAvailable');
  if (available === null) {
    return { totalMiB, usedMiB: totalMiB - freemem() / (1024 * 1024) };
  }
  return { totalMiB, usedMiB: totalMiB - available / 1024 };
}

async function sampleMemory(): Promise<{ totalMiB: number; usedMiB: number }> {
  const totalMiB = totalmem() / (1024 * 1024);
  try {
    if (platform() === 'darwin') return await sampleMemoryDarwin(totalMiB);
    if (platform() === 'linux') return await sampleMemoryLinux(totalMiB);
  } catch {
    // Fall through to the generic estimate below.
  }
  return { totalMiB, usedMiB: totalMiB - freemem() / (1024 * 1024) };
}

export function startSystemMonitor(dataDir: string): void {
  let prev = sampleCpuTimes();
  let stopped = false;

  const tick = async (): Promise<void> => {
    const curr = sampleCpuTimes();
    const busyDelta = curr.busy - prev.busy;
    const totalDelta = curr.total - prev.total;
    const cpuPercent = totalDelta > 0 ? (busyDelta / totalDelta) * 100 : 0;
    prev = curr;

    const status = llamaServer.getStatus();
    const pid =
      (status.state === 'running' || status.state === 'starting') && status.pid
        ? status.pid
        : null;

    const [memory, procStats] = await Promise.all([
      sampleMemory(),
      pid ? sampleProcessUsage(pid) : Promise.resolve(null),
    ]);

    const payload: SystemStatsPayload = {
      at: new Date().toISOString(),
      system: {
        cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
        cpuCores: cpus().length,
        memTotalMiB: memory.totalMiB,
        memUsedMiB: memory.usedMiB,
      },
      process: pid && procStats ? { pid, ...procStats } : null,
    };
    bus.emitEvent('system.stats', payload);
  };

  const scheduleNext = async (): Promise<void> => {
    if (stopped) return;
    let interval = FALLBACK_INTERVAL_MS;
    try {
      const settings = await readSettings(dataDir);
      interval = settings.telemetryIntervalMs;
    } catch {
      // settings read failure: use fallback interval, keep sampling.
    }
    const timer = setTimeout(() => {
      void tick().finally(scheduleNext);
    }, interval);
    timer.unref();
  };

  void scheduleNext();
}
