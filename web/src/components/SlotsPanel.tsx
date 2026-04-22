import { useRuntimeStore } from '../stores/runtime';
import type { SlotState } from '../types';

export function SlotsPanel(): React.ReactElement {
  const slots = useRuntimeStore((s) => s.slots?.slots ?? null);

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Slots</h3>
      {!slots ? (
        <div className="mt-3 text-xs opacity-50">Waiting for /slots…</div>
      ) : slots.length === 0 ? (
        <div className="mt-3 text-xs opacity-50">No slots reported.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left opacity-60">
                <th className="pb-2 pr-3 font-normal">Slot</th>
                <th className="pb-2 pr-3 font-normal">State</th>
                <th className="pb-2 pr-3 font-normal">Task</th>
                <th className="pb-2 pr-3 font-normal">Context</th>
                <th className="pb-2 pr-3 font-normal">Decoded</th>
                <th className="pb-2 pr-3 font-normal">Sampling</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <SlotRow key={s.id} slot={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SlotRow({ slot }: { slot: SlotState }): React.ReactElement {
  const pct =
    slot.nPast !== undefined && slot.nCtx !== undefined && slot.nCtx > 0
      ? Math.min(1, slot.nPast / slot.nCtx)
      : 0;
  return (
    <tr className="border-t border-neutral-200 align-top dark:border-neutral-800">
      <td className="py-2 pr-3 font-mono">{slot.id}</td>
      <td className="py-2 pr-3">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
            slot.isProcessing
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-neutral-200 opacity-60 dark:bg-neutral-800'
          }`}
        >
          {slot.isProcessing ? 'busy' : 'idle'}
        </span>
      </td>
      <td className="py-2 pr-3 font-mono">{slot.taskId ?? '—'}</td>
      <td className="py-2 pr-3">
        {slot.nPast !== undefined && slot.nCtx !== undefined ? (
          <div>
            <div className="font-mono text-[11px]">
              {slot.nPast}/{slot.nCtx}
            </div>
            <div className="mt-0.5 h-1 w-24 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
              <div className="h-full bg-sky-500" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
        ) : (
          <span className="opacity-30">—</span>
        )}
      </td>
      <td className="py-2 pr-3 font-mono">
        {slot.nDecoded !== undefined ? slot.nDecoded : <span className="opacity-30">—</span>}
      </td>
      <td className="py-2 pr-3 font-mono">
        {slot.samplingParams
          ? [
              slot.samplingParams.temperature !== undefined ? `t=${slot.samplingParams.temperature.toFixed(2)}` : '',
              slot.samplingParams.topP !== undefined ? `top_p=${slot.samplingParams.topP.toFixed(2)}` : '',
              slot.samplingParams.topK !== undefined ? `top_k=${slot.samplingParams.topK}` : '',
            ]
              .filter(Boolean)
              .join(' ')
          : <span className="opacity-30">—</span>}
      </td>
    </tr>
  );
}
