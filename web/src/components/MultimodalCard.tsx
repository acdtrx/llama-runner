import type { MultimodalInfo } from '../types';
import { formatMiB } from './format';

interface Props {
  multimodal?: MultimodalInfo;
}

export function MultimodalCard({ multimodal }: Props): React.ReactElement | null {
  if (!multimodal) return null;
  if (!multimodal.hasVision && !multimodal.hasAudio) return null;

  return (
    <section className="h-full rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Multimodal</h3>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {multimodal.hasVision && <Badge tone="indigo">Vision</Badge>}
        {multimodal.hasAudio && <Badge tone="emerald">Audio</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {multimodal.hasVision && (
          <>
            {multimodal.visionProjector && <Row label="Vision projector" value={multimodal.visionProjector} />}
            {multimodal.visionModelSizeMiB !== undefined && (
              <Row label="Vision size" value={formatMiB(multimodal.visionModelSizeMiB)} />
            )}
            {multimodal.imageSize !== undefined && (
              <Row
                label="Image size"
                value={`${multimodal.imageSize}px (patch ${multimodal.patchSize ?? '?'})`}
              />
            )}
            {multimodal.imageMinPixels !== undefined && (
              <Row
                label="Image pixels"
                value={`${multimodal.imageMinPixels}–${multimodal.imageMaxPixels ?? '?'}`}
              />
            )}
          </>
        )}
        {multimodal.hasAudio && (
          <>
            {multimodal.audioProjector && <Row label="Audio projector" value={multimodal.audioProjector} />}
            {multimodal.audioModelSizeMiB !== undefined && (
              <Row label="Audio size" value={formatMiB(multimodal.audioModelSizeMiB)} />
            )}
            {multimodal.audioSampleRate !== undefined && (
              <Row label="Sample rate" value={`${multimodal.audioSampleRate} Hz`} />
            )}
            {multimodal.audioNMelBins !== undefined && (
              <Row label="Mel bins" value={String(multimodal.audioNMelBins)} />
            )}
          </>
        )}
      </dl>
      {multimodal.mmprojPath && (
        <div className="mt-3 truncate font-mono text-[10px] opacity-50" title={multimodal.mmprojPath}>
          {multimodal.mmprojPath}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <>
      <dt className="opacity-60">{label}</dt>
      <dd className="truncate font-mono" title={value}>
        {value}
      </dd>
    </>
  );
}

function Badge({ tone, children }: { tone: 'indigo' | 'emerald'; children: React.ReactNode }): React.ReactElement {
  const toneClass =
    tone === 'indigo'
      ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  return <span className={`rounded px-2 py-0.5 font-mono ${toneClass}`}>{children}</span>;
}
