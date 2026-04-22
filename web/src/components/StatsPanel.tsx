import { ConfigNoticesPanel } from './ConfigNoticesPanel';
import { ErrorsPanel } from './ErrorsPanel';
import { GpuCapabilitiesCard } from './GpuCapabilitiesCard';
import { LayerOffloadCard } from './LayerOffloadCard';
import { MemoryBreakdownCard } from './MemoryBreakdownCard';
import { MemoryBudgetCard } from './MemoryBudgetCard';
import { ModelMetadataCard } from './ModelMetadataCard';
import { MultimodalCard } from './MultimodalCard';
import { PromptCacheCard } from './PromptCacheCard';
import { RecentRequestsTable } from './RecentRequestsTable';
import { RuntimeMetricsCard } from './RuntimeMetricsCard';
import { SlotsPanel } from './SlotsPanel';
import { StartupInfoCard } from './StartupInfoCard';
import { SystemStatsCard } from './SystemStatsCard';
import { TensorTypesCard } from './TensorTypesCard';
import { ThroughputChart } from './ThroughputChart';
import { TotalsCard } from './TotalsCard';
import type { SessionMetrics } from '../types';

interface Props {
  metrics: SessionMetrics;
  isLive: boolean;
}

export function StatsPanel({ metrics, isLive }: Props): React.ReactElement {
  const hasErrors = metrics.errors.length > 0;

  return (
    <section className="p-4">
      <div className="grid grid-cols-12 gap-3">
        {isLive && (
          <div className="col-span-12">
            <SystemStatsCard />
          </div>
        )}

        <div className="col-span-12">
          <ConfigNoticesPanel />
        </div>

        {isLive && (
          <div className="col-span-12">
            <RuntimeMetricsCard />
          </div>
        )}

        <div className="col-span-12 md:col-span-5">
          <TotalsCard totals={metrics.totals} />
        </div>
        <div className="col-span-12 md:col-span-7">
          <MemoryBudgetCard startup={metrics.startup} />
        </div>

        <div className="col-span-12">
          <ThroughputChart requests={metrics.requests} />
        </div>

        {isLive && (
          <div className="col-span-12">
            <SlotsPanel />
          </div>
        )}

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

        <div className="col-span-12 md:col-span-6">
          <TensorTypesCard types={metrics.startup.tensorTypes} />
        </div>
        <div className="col-span-12 md:col-span-6">
          <LayerOffloadCard offload={metrics.startup.layerOffload} />
        </div>

        <div className="col-span-12 md:col-span-6">
          <ModelMetadataCard metadata={metrics.startup.model.metadata} />
        </div>
        <div className="col-span-12 md:col-span-6">
          <GpuCapabilitiesCard caps={metrics.startup.gpuCapabilities} />
        </div>

        <div className="col-span-12 md:col-span-6">
          <MultimodalCard multimodal={metrics.startup.multimodal} />
        </div>
        <div className="col-span-12 md:col-span-6">
          <StartupInfoCard startup={metrics.startup} />
        </div>

        {metrics.memoryBreakdownExit && (
          <div className="col-span-12">
            <MemoryBreakdownCard breakdown={metrics.memoryBreakdownExit} />
          </div>
        )}

        {hasErrors && (
          <div className="col-span-12">
            <ErrorsPanel errors={metrics.errors} />
          </div>
        )}
      </div>
    </section>
  );
}
