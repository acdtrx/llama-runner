import { ErrorsPanel } from './ErrorsPanel';
import { MemoryBudgetCard } from './MemoryBudgetCard';
import { PromptCacheCard } from './PromptCacheCard';
import { RecentRequestsTable } from './RecentRequestsTable';
import { StartupInfoCard } from './StartupInfoCard';
import { ThroughputChart } from './ThroughputChart';
import { TotalsCard } from './TotalsCard';
import type { SessionMetrics } from '../types';

interface Props {
  metrics: SessionMetrics;
}

export function StatsPanel({ metrics }: Props): React.ReactElement {
  const hasErrors = metrics.errors.length > 0;

  return (
    <section className="p-4">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-5">
          <TotalsCard totals={metrics.totals} />
        </div>
        <div className="col-span-12 md:col-span-7">
          <MemoryBudgetCard startup={metrics.startup} />
        </div>

        <div className="col-span-12">
          <ThroughputChart requests={metrics.requests} />
        </div>

        <div className="col-span-12 md:col-span-7">
          <RecentRequestsTable requests={metrics.requests} />
        </div>
        <div className="col-span-12 md:col-span-5">
          <PromptCacheCard
            cache={metrics.cache}
            limitMiB={metrics.startup.promptCacheLimitMiB}
            limitTokens={metrics.startup.promptCacheLimitTokens}
          />
        </div>

        <div className={hasErrors ? 'col-span-12 md:col-span-8' : 'col-span-12'}>
          <StartupInfoCard startup={metrics.startup} />
        </div>
        {hasErrors && (
          <div className="col-span-12 md:col-span-4">
            <ErrorsPanel errors={metrics.errors} />
          </div>
        )}
      </div>
    </section>
  );
}
