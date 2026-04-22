import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { listModels } from '../api/models';
import { HttpError } from '../api/http';
import { RESERVED_FLAGS } from '../types';
import type { ApiError, ModelSource, NewProfile } from '../types';

interface Props {
  initial: NewProfile;
  submitLabel: string;
  onSubmit: (value: NewProfile) => Promise<void>;
  onCancel?: () => void;
}

const EMPTY_MODELS: string[] = [];

const INPUT_CLASS =
  'mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

function quickReservedScan(argsLine: string): string[] {
  const tokens = argsLine.split(/\s+/).filter((t) => t.length > 0 && t.startsWith('-'));
  const offenders = new Set<string>();
  for (const tok of tokens) {
    const eq = tok.indexOf('=');
    const name = eq > 0 ? tok.slice(0, eq) : tok;
    if ((RESERVED_FLAGS as readonly string[]).includes(name)) offenders.add(name);
  }
  return Array.from(offenders);
}

export function ProfileConfigForm({ initial, submitLabel, onSubmit, onCancel }: Props): React.ReactElement {
  const [form, setForm] = useState<NewProfile>(initial);
  const [models, setModels] = useState<string[]>(EMPTY_MODELS);
  const [modelsError, setModelsError] = useState<ApiError | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((files) => {
        if (!cancelled) setModels(files);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof HttpError) setModelsError(err.apiError);
        else setModelsError({ code: 'INTERNAL_ERROR', message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof NewProfile>(key: K, value: NewProfile[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (submitError) setSubmitError(null);
  }

  function setModelSource(next: ModelSource): void {
    setForm((prev) => {
      const draft: NewProfile = {
        ...prev,
        modelSource: next,
      };
      if (next === 'file') {
        delete draft.modelRepo;
        if (draft.modelFile === undefined) draft.modelFile = '';
      } else {
        delete draft.modelFile;
        if (draft.modelRepo === undefined) draft.modelRepo = '';
      }
      return draft;
    });
    if (submitError) setSubmitError(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      const payload: NewProfile = {
        name: form.name.trim(),
        modelSource: form.modelSource,
        argsLine: form.argsLine.trim(),
      };
      if (form.modelSource === 'file' && form.modelFile) {
        payload.modelFile = form.modelFile.trim();
      }
      if (form.modelSource === 'hf' && form.modelRepo) {
        payload.modelRepo = form.modelRepo.trim();
      }
      if (form.description && form.description.trim().length > 0) {
        payload.description = form.description.trim();
      }
      if (form.clonedFromTemplateId) payload.clonedFromTemplateId = form.clonedFromTemplateId;
      await onSubmit(payload);
    } catch (err) {
      if (err instanceof HttpError) setSubmitError(err.apiError);
      else setSubmitError({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const reservedInForm = quickReservedScan(form.argsLine);
  const errorField = submitError?.details?.field;

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="mx-auto max-w-2xl space-y-5 p-6">
      {submitError && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          <strong>Could not save:</strong> {submitError.message}
          {Array.isArray(submitError.details?.flags) ? (
            <div className="mt-1 font-mono text-xs opacity-80">
              reserved flags: {(submitError.details.flags as string[]).join(', ')}
            </div>
          ) : null}
        </div>
      )}

      <label className="block">
        <span className="block text-sm font-medium">Name</span>
        <input
          className={INPUT_CLASS}
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          maxLength={120}
          required
        />
        {errorField === 'name' && <span className="mt-1 block text-xs text-red-600">{submitError?.message}</span>}
      </label>

      <label className="block">
        <span className="block text-sm font-medium">Description</span>
        <textarea
          className={INPUT_CLASS}
          rows={2}
          value={form.description ?? ''}
          onChange={(e) => update('description', e.target.value)}
          maxLength={2000}
          placeholder="Optional notes about this profile."
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Model source</legend>
        <div className="flex gap-2">
          <SourceButton
            active={form.modelSource === 'file'}
            onClick={() => setModelSource('file')}
            label="Local file"
            hint={`--model <modelsDir>/<file>`}
          />
          <SourceButton
            active={form.modelSource === 'hf'}
            onClick={() => setModelSource('hf')}
            label="HuggingFace"
            hint={`-hf <owner/repo[:quant]>`}
          />
        </div>

        {form.modelSource === 'file' ? (
          <div>
            <span className="block text-xs opacity-60">
              Choose a GGUF file from your configured models directory.
            </span>
            {modelsError ? (
              <>
                <input
                  className={INPUT_CLASS}
                  type="text"
                  value={form.modelFile ?? ''}
                  onChange={(e) => update('modelFile', e.target.value)}
                  placeholder="name.gguf"
                  required
                />
                <span className="mt-1 block text-xs text-amber-600">
                  Could not list models directory ({modelsError.message}). Enter a filename manually.
                </span>
              </>
            ) : (
              <select
                className={INPUT_CLASS}
                value={form.modelFile ?? ''}
                onChange={(e) => update('modelFile', e.target.value)}
                required
              >
                <option value="">Select a model…</option>
                {models.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                {form.modelFile && !models.includes(form.modelFile) && (
                  <option value={form.modelFile}>{form.modelFile} (not in directory)</option>
                )}
              </select>
            )}
            {errorField === 'modelFile' && (
              <span className="mt-1 block text-xs text-red-600">{submitError?.message}</span>
            )}
          </div>
        ) : (
          <div>
            <span className="block text-xs opacity-60">
              HuggingFace repository reference, optionally with a <code>:quant</code> suffix. Downloaded on first start.
            </span>
            <input
              className={`${INPUT_CLASS} font-mono`}
              type="text"
              value={form.modelRepo ?? ''}
              onChange={(e) => update('modelRepo', e.target.value)}
              placeholder="unsloth/gemma-4-E4B-it-GGUF:Q8_0"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              required
            />
            {errorField === 'modelRepo' && (
              <span className="mt-1 block text-xs text-red-600">{submitError?.message}</span>
            )}
          </div>
        )}
      </fieldset>

      <label className="block">
        <span className="block text-sm font-medium">CLI arguments</span>
        <textarea
          className={`${INPUT_CLASS} font-mono`}
          rows={3}
          value={form.argsLine}
          onChange={(e) => update('argsLine', e.target.value)}
          placeholder="-ngl 99 -c 65536 --jinja"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          maxLength={8000}
        />
        <span className="mt-1 block text-xs opacity-60">
          Extra flags passed to <code>llama-server</code>. Quoted values are preserved (e.g.{' '}
          <code>--chat-template &quot;hello world&quot;</code>). <code>--model</code>, <code>-m</code>,{' '}
          <code>-hf</code>, <code>--host</code>, <code>--port</code>, <code>--metrics</code> are injected automatically.
        </span>
        {errorField === 'argsLine' && (
          <span className="mt-1 block text-xs text-red-600">{submitError?.message}</span>
        )}
        {reservedInForm.length > 0 && errorField !== 'argsLine' && (
          <span className="mt-1 block text-xs text-amber-600">
            These flags are reserved and will be rejected: {reservedInForm.join(', ')}
          </span>
        )}
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          title="Save (⌘/Ctrl + Enter)"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            title="Cancel (Esc)"
            className="rounded px-4 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface SourceButtonProps {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}

function SourceButton({ active, label, hint, onClick }: SourceButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded border px-3 py-2 text-left text-xs ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200'
          : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 font-mono opacity-60">{hint}</div>
    </button>
  );
}
