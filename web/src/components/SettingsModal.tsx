import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';

import { useModalStore } from '../stores/modal';
import { useSettingsStore } from '../stores/settings';
import type { Settings } from '../types';

const DEFAULT_FORM: Settings = {
  llamaServerBinaryPath: '',
  modelsDir: '',
  llamaServerHost: '127.0.0.1',
  llamaServerPort: 11434,
  sessionsPerProfileLimit: 20,
  uiNoiseFilterEnabledByDefault: true,
};

const INPUT_CLASS =
  'mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export function SettingsModal(): React.ReactElement | null {
  const open = useModalStore((s) => s.open === 'settings');
  const close = useModalStore((s) => s.close);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const { settings, loading, saving, loadError, saveError, load, save, clearSaveError } = useSettingsStore();
  const [form, setForm] = useState<Settings>(DEFAULT_FORM);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load();
    setJustSaved(false);
    if (saveError) clearSaveError();
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [open, load, clearSaveError, saveError]);

  useEffect(() => {
    if (!open) {
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!open) return null;

  function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (saveError) clearSaveError();
    if (justSaved) setJustSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await save(form);
      setJustSaved(true);
    } catch {
      // error surfaced via store.saveError
    }
  }

  const errorField = saveError?.details?.field;

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onCancel={close}
      className="fixed left-1/2 top-1/2 w-[min(40rem,90vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button
          type="button"
          onClick={close}
          title="Close (Esc)"
          aria-label="Close settings"
          className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <X size={16} />
        </button>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <p className="text-sm opacity-70">
          Configure where <code>llama-server</code> lives and where your models are stored. These values apply to every profile.
        </p>

        {loadError && (
          <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
            Failed to load settings: {loadError.message}
          </div>
        )}

        {saveError && (
          <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
            <strong>Could not save:</strong> {saveError.message}
            {typeof saveError.details?.path === 'string' && (
              <div className="mt-1 font-mono text-xs opacity-80">path: {saveError.details.path}</div>
            )}
          </div>
        )}

        {justSaved && (
          <div className="rounded border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Settings saved.
          </div>
        )}

        <Field
          label="llama-server binary path"
          help="Absolute path to the llama-server executable built from llama.cpp."
          error={errorField === 'llamaServerBinaryPath' ? saveError?.message : undefined}
        >
          <input
            className={INPUT_CLASS}
            type="text"
            value={form.llamaServerBinaryPath}
            onChange={(e) => update('llamaServerBinaryPath', e.target.value)}
            placeholder="/usr/local/bin/llama-server"
            required
          />
        </Field>

        <Field
          label="Models directory"
          help="Directory containing your GGUF model files. Only required for Local-file profiles; HF-mode profiles download into llama-server's own cache."
          error={errorField === 'modelsDir' ? saveError?.message : undefined}
        >
          <input
            className={INPUT_CLASS}
            type="text"
            value={form.modelsDir}
            onChange={(e) => update('modelsDir', e.target.value)}
            placeholder="/Users/you/models"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Host" help="Interface llama-server binds to. Default loopback.">
            <input
              className={INPUT_CLASS}
              type="text"
              value={form.llamaServerHost}
              onChange={(e) => update('llamaServerHost', e.target.value)}
              required
            />
          </Field>
          <Field label="Port" help="TCP port llama-server binds to.">
            <input
              className={INPUT_CLASS}
              type="number"
              min={1}
              max={65535}
              value={form.llamaServerPort}
              onChange={(e) => update('llamaServerPort', Number.parseInt(e.target.value, 10) || 0)}
              required
            />
          </Field>
        </div>

        <Field label="Sessions retained per profile" help="Older sessions are pruned automatically on run end.">
          <input
            className={INPUT_CLASS}
            type="number"
            min={1}
            max={1000}
            value={form.sessionsPerProfileLimit}
            onChange={(e) => update('sessionsPerProfileLimit', Number.parseInt(e.target.value, 10) || 0)}
            required
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.uiNoiseFilterEnabledByDefault}
            onChange={(e) => update('uiNoiseFilterEnabledByDefault', e.target.checked)}
          />
          Hide noisy log lines by default
        </label>

        <div className="flex items-center gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded px-4 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            Close
          </button>
          {loading && <span className="text-sm opacity-60">Loading…</span>}
        </div>
      </form>
    </dialog>
  );
}

interface FieldProps {
  label: string;
  help?: string;
  error?: string | undefined;
  children: React.ReactNode;
}

function Field({ label, help, error, children }: FieldProps): React.ReactElement {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
      {!error && help && <span className="mt-1 block text-xs opacity-60">{help}</span>}
    </label>
  );
}
