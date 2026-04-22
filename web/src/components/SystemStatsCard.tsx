import { useSystemStore } from '../stores/system';
import { formatMiB } from './format';

export function SystemStatsCard(): React.ReactElement {
  const latest = useSystemStore((s) => s.latest);

  if (!latest) {
    return (
      <section className="rounded border border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="text-xs opacity-50">Waiting for system stats…</div>
      </section>
    );
  }

  const { system, process } = latest;
  const procCpuFill = process ? process.cpuPercent / (system.cpuCores * 100) : 0;
  const procRamFill = process ? process.rssMiB / system.memTotalMiB : 0;
  const sysCpuFill = system.cpuPercent / 100;
  const sysRamFill = system.memUsedMiB / system.memTotalMiB;

  return (
    <section className="rounded border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        <Gauge
          label="llama-server CPU"
          value={process ? `${process.cpuPercent.toFixed(0)}%` : '—'}
          sub={process ? `of ${system.cpuCores} cores` : 'not running'}
          fill={procCpuFill}
          color="bg-emerald-500"
        />
        <Gauge
          label="llama-server RAM"
          value={process ? formatMiB(process.rssMiB) : '—'}
          sub={process ? `${(procRamFill * 100).toFixed(0)}% of system` : 'not running'}
          fill={procRamFill}
          color="bg-emerald-500"
        />
        <Gauge
          label="System CPU"
          value={`${system.cpuPercent.toFixed(0)}%`}
          sub={`${system.cpuCores} cores`}
          fill={sysCpuFill}
          color="bg-sky-500"
        />
        <Gauge
          label="System RAM"
          value={formatMiB(system.memUsedMiB)}
          sub={`of ${formatMiB(system.memTotalMiB)}`}
          fill={sysRamFill}
          color="bg-sky-500"
        />
      </div>
    </section>
  );
}

interface GaugeProps {
  label: string;
  value: string;
  sub: string;
  fill: number;
  color: string;
}

function Gauge({ label, value, sub, fill, color }: GaugeProps): React.ReactElement {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate opacity-60">{label}</span>
        <span className="shrink-0 font-mono opacity-40">{sub}</span>
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums">{value}</div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        <div className={`${color} h-full transition-[width] duration-500 ease-out`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
