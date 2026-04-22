import type { ModelMetadata } from '../types';
import { formatCount } from './format';

interface Props {
  metadata?: ModelMetadata;
}

export function ModelMetadataCard({ metadata }: Props): React.ReactElement | null {
  if (!metadata) return null;
  const hasAny =
    metadata.license ||
    metadata.repoUrl ||
    (metadata.tags && metadata.tags.length > 0) ||
    (metadata.baseModels && metadata.baseModels.length > 0) ||
    metadata.imatrixEntries !== undefined ||
    metadata.nParamsBillion !== undefined ||
    metadata.nVocab !== undefined;
  if (!hasAny) return null;

  return (
    <section className="h-full rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Model metadata</h3>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {metadata.license && (
          <Badge>
            license:{' '}
            {metadata.licenseLink ? (
              <a href={metadata.licenseLink} target="_blank" rel="noopener noreferrer" className="underline">
                {metadata.license}
              </a>
            ) : (
              <span>{metadata.license}</span>
            )}
          </Badge>
        )}
        {metadata.nParamsBillion !== undefined && (
          <Badge>{metadata.nParamsBillion.toFixed(2)} B params</Badge>
        )}
        {metadata.nVocab !== undefined && <Badge>vocab {formatCount(metadata.nVocab)}</Badge>}
        {metadata.nMerges !== undefined && <Badge>merges {formatCount(metadata.nMerges)}</Badge>}
        {(metadata.tags ?? []).map((t) => (
          <Badge key={t}>#{t}</Badge>
        ))}
      </div>
      {metadata.baseModels && metadata.baseModels.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide opacity-50">Base model{metadata.baseModels.length > 1 ? 's' : ''}</div>
          <ul className="mt-1 text-xs">
            {metadata.baseModels.map((b, i) => (
              <li key={i} className="font-mono">
                {b.organization && <span className="opacity-60">{b.organization} / </span>}
                {b.repoUrl ? (
                  <a href={b.repoUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {b.name ?? b.repoUrl}
                  </a>
                ) : (
                  b.name ?? '—'
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {metadata.imatrixEntries !== undefined && (
        <div className="mt-3 text-[11px] opacity-70">
          imatrix: {metadata.imatrixEntries} entries / {metadata.imatrixChunks ?? '?'} chunks
          {metadata.imatrixDataset && <span className="opacity-60"> · {metadata.imatrixDataset}</span>}
        </div>
      )}
      {metadata.repoUrl && (
        <div className="mt-2 text-[11px]">
          <a href={metadata.repoUrl} target="_blank" rel="noopener noreferrer" className="underline opacity-70 hover:opacity-100">
            {metadata.repoUrl}
          </a>
        </div>
      )}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono dark:border-neutral-700 dark:bg-neutral-900">
      {children}
    </span>
  );
}
