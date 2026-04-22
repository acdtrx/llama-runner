import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import type { LogLineEvent } from '../types';

interface Props {
  lines: LogLineEvent[];
  hideNoise: boolean;
  onHideNoiseChange: (next: boolean) => void;
  onClear?: () => void;
  title?: string;
}

export function LogPanel({
  lines,
  hideNoise,
  onHideNoiseChange,
  onClear,
  title = 'Logs',
}: Props): React.ReactElement {
  const visible = useMemo<LogLineEvent[]>(
    () => (hideNoise ? lines.filter((l) => !l.noise) : lines),
    [lines, hideNoise],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const noisyCount = useMemo(() => lines.filter((l) => l.noise).length, [lines]);

  function handleScroll(): void {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom < 32);
  }

  useLayoutEffect(() => {
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, stickToBottom]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '.') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      onHideNoiseChange(!hideNoise);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideNoise, onHideNoiseChange]);

  return (
    <section className="flex h-full flex-col border-t border-neutral-200 dark:border-neutral-800">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950">
        <span className="font-medium">{title}</span>
        <span className="opacity-50">
          {visible.length}/{lines.length} lines
          {hideNoise && noisyCount > 0 && ` · ${noisyCount} noisy hidden`}
          {!stickToBottom && ' · paused'}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5" title="Toggle (.)">
            <input type="checkbox" checked={hideNoise} onChange={(e) => onHideNoiseChange(e.target.checked)} />
            Hide noise
          </label>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Clear log panel (does not affect raw.log on disk)"
              aria-label="Clear log panel"
              className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-white p-2 font-mono text-xs leading-relaxed dark:bg-neutral-950"
      >
        {visible.length === 0 ? (
          <div className="px-1 py-2 opacity-50">
            {lines.length === 0 ? 'No log lines yet.' : 'All lines are hidden by the noise filter.'}
          </div>
        ) : (
          visible.map((l) => (
            <div
              key={`${l.sessionId}-${l.lineId}`}
              className={`whitespace-pre-wrap break-words ${
                l.stream === 'stderr'
                  ? 'border-l-2 border-neutral-400 pl-2 opacity-90 dark:border-neutral-600'
                  : ''
              }`}
              title={l.stream === 'stderr' ? 'stderr' : undefined}
            >
              {l.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
