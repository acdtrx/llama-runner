import { ChevronRight } from 'lucide-react';

import type { StartupMetrics } from '../types';
import { formatCount } from './format';

interface Props {
  startup: StartupMetrics;
}

export function StartupInfoCard({ startup }: Props): React.ReactElement {
  const model = startup.model;
  const ctx = startup.context;

  return (
    <section className="rounded border border-neutral-200 dark:border-neutral-800">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide opacity-70 hover:opacity-100">
          <ChevronRight
            size={14}
            className="shrink-0 transition-transform group-open:rotate-90"
          />
          Startup
        </summary>

        <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs md:grid-cols-3">
            <Group title="Model">
              <Item label="File" value={model.filename} />
              <Item label="Quant" value={model.fileType} />
              <Item
                label="Size"
                value={model.fileSizeGiB ? `${model.fileSizeGiB.toFixed(2)} GiB` : undefined}
              />
              <Item label="Arch" value={model.architecture} />
              <Item label="Params" value={model.sizeLabel} />
              <Item label="Quantized by" value={model.quantizedBy} />
            </Group>

            <Group title="Context">
              <Item
                label="Trained"
                value={model.contextLengthTrained ? formatCount(model.contextLengthTrained) : undefined}
              />
              <Item label="Active" value={ctx.nCtx ? formatCount(ctx.nCtx) : undefined} />
              <Item
                label="Batch / ubatch"
                value={ctx.nBatch && ctx.nUbatch ? `${ctx.nBatch} / ${ctx.nUbatch}` : undefined}
              />
              <Item label="Flash attn" value={ctx.flashAttn} />
            </Group>

            <Group title="Backend">
              <Item label="Backend" value={startup.backend} />
              <Item label="Device" value={startup.deviceName} />
              <Item
                label="Device free"
                value={startup.deviceFreeMiB !== undefined ? `${startup.deviceFreeMiB} MiB` : undefined}
              />
              <Item label="Threads" value={startup.threads !== undefined ? String(startup.threads) : undefined} />
              {startup.simdFeatures && startup.simdFeatures.length > 0 && (
                <div className="col-span-2 mt-1">
                  <div className="text-[10px] uppercase tracking-wide opacity-50">SIMD</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {startup.simdFeatures.map((f) => (
                      <span
                        key={f}
                        className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Group>
          </div>
        </div>
      </details>
    </section>
  );
}

interface GroupProps {
  title: string;
  children: React.ReactNode;
}

function Group({ title, children }: GroupProps): React.ReactElement {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{title}</div>
      <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">{children}</dl>
    </div>
  );
}

interface ItemProps {
  label: string;
  value: string | undefined;
}

function Item({ label, value }: ItemProps): React.ReactElement {
  return (
    <>
      <dt className="opacity-60">{label}</dt>
      <dd className="truncate font-mono" title={value ?? ''}>
        {value ?? <span className="opacity-30">—</span>}
      </dd>
    </>
  );
}
