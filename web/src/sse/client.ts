type Listener<T = unknown> = (data: T) => void;
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type StateListener = (state: ConnectionState) => void;

const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = (): void => {
        clearTimeout(id);
        reject(new DOMException('aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

class SseClient {
  private readonly url: string;
  private controller: AbortController | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly stateListeners = new Set<StateListener>();
  private running = false;
  private backoff = BACKOFF_MIN_MS;
  private state: ConnectionState = 'disconnected';

  constructor(url: string) {
    this.url = url;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.controller = null;
    this.setState('disconnected');
  }

  on<T = unknown>(event: string, handler: Listener<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Listener);
    return () => set?.delete(handler as Listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  onState(handler: StateListener): () => void {
    this.stateListeners.add(handler);
    handler(this.state);
    return () => this.stateListeners.delete(handler);
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of this.stateListeners) l(next);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      this.controller = new AbortController();
      this.setState('connecting');
      try {
        await this.connect(this.controller.signal);
        if (!this.running) return;
        // Clean close by server; treat as a dropped connection.
        this.setState('disconnected');
      } catch (err) {
        if (!this.running) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        this.setState('disconnected');
      }
      if (!this.running) return;
      try {
        await wait(this.backoff, this.controller?.signal);
      } catch {
        return;
      }
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    }
  }

  private async connect(signal: AbortSignal): Promise<void> {
    const res = await fetch(this.url, {
      signal,
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
    });
    if (!res.ok || !res.body) throw new Error(`SSE connect failed: HTTP ${res.status}`);
    this.backoff = BACKOFF_MIN_MS;
    this.setState('connected');
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.dispatch(frame);
        sep = buffer.indexOf('\n\n');
      }
    }
  }

  private dispatch(frame: string): void {
    if (frame.length === 0) return;
    let event = 'message';
    let data = '';
    for (const rawLine of frame.split('\n')) {
      if (rawLine.length === 0 || rawLine.startsWith(':')) continue;
      const colon = rawLine.indexOf(':');
      const field = colon >= 0 ? rawLine.slice(0, colon) : rawLine;
      let val = colon >= 0 ? rawLine.slice(colon + 1) : '';
      if (val.startsWith(' ')) val = val.slice(1);
      if (field === 'event') event = val;
      else if (field === 'data') data += (data.length > 0 ? '\n' : '') + val;
    }
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    let payload: unknown = data;
    if (data.length > 0) {
      try {
        payload = JSON.parse(data);
      } catch {
        // Leave payload as raw string for non-JSON events.
      }
    }
    for (const handler of handlers) handler(payload);
  }
}

export const sseClient = new SseClient('/api/events');
