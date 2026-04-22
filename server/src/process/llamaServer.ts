import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AppError } from '../errors.js';
import type { Profile } from '../config/profiles.js';
import type { Settings } from '../config/settings.js';
import { beginSession, finalizeSession } from '../sessions/writer.js';
import type { SessionPaths } from '../sessions/writer.js';
import { tokenizeArgs } from '../util/argsTokenizer.js';

export type ServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface ServerStatus {
  state: ServerState;
  profileId: string | null;
  sessionId: string | null;
  startedAt: string | null;
  pid: number | null;
  listeningUrl: string | null;
}

interface RunContext {
  profile: Profile;
  settings: Settings;
  session: SessionPaths;
  child: ChildProcess;
  startedAt: string;
  listeningUrl: string | null;
  stopRequested: boolean;
  exitPromise: Promise<void>;
}

type LineEvent = { sessionId: string; stream: 'stdout' | 'stderr'; text: string };
type ExitEvent = { sessionId: string; code: number | null; signal: NodeJS.Signals | null; crashed: boolean };
type SessionOpenEvent = {
  sessionId: string;
  profileId: string;
  rawLogPath: string;
  metricsPath: string;
  sessionDir: string;
  startedAt: string;
};
type SessionCloseEvent = ExitEvent & { profileId: string; endedAt: string };

class LlamaServerFacade extends EventEmitter {
  private status: ServerStatus = idleStatus();
  private current: RunContext | null = null;
  private pending: Promise<ServerStatus> | null = null;

  getStatus(): ServerStatus {
    return { ...this.status };
  }

  async start(profile: Profile, settings: Settings, dataDir: string): Promise<ServerStatus> {
    if (this.pending) await this.pending;
    if (this.status.state === 'starting' || this.status.state === 'stopping') {
      throw new AppError('CONFLICT', `server is busy (${this.status.state})`);
    }
    if (this.status.state === 'running') {
      await this.stop();
    }
    this.pending = this.doStart(profile, settings, dataDir).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async stop(): Promise<ServerStatus> {
    if (
      this.status.state === 'idle' ||
      this.status.state === 'stopped' ||
      this.status.state === 'crashed'
    ) {
      return this.getStatus();
    }
    const ctx = this.current;
    if (!ctx) return this.getStatus();

    if (this.status.state !== 'stopping') {
      ctx.stopRequested = true;
      this.setStatus({ ...this.status, state: 'stopping' });
      ctx.child.kill('SIGTERM');
      setTimeout(() => {
        if (!ctx.child.killed && ctx.child.exitCode === null) {
          ctx.child.kill('SIGKILL');
        }
      }, 5000).unref();
    }

    await ctx.exitPromise;
    return this.getStatus();
  }

  private async doStart(profile: Profile, settings: Settings, dataDir: string): Promise<ServerStatus> {
    assertSettingsComplete(settings);
    await assertBinaryUsable(settings.llamaServerBinaryPath);

    const modelArgs = buildModelArgs(profile, settings);

    let userArgs: string[];
    try {
      userArgs = tokenizeArgs(profile.argsLine ?? '');
    } catch (err) {
      throw new AppError('VALIDATION_ERROR', (err as Error).message, { field: 'argsLine' });
    }

    const session = await beginSession(dataDir, profile, settings);

    const argv = [
      ...modelArgs,
      '--host',
      settings.llamaServerHost,
      '--port',
      String(settings.llamaServerPort),
      '--metrics',
      ...userArgs,
    ];

    const child = spawn(settings.llamaServerBinaryPath, argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: false,
    });

    const startedAt = new Date().toISOString();
    const exitPromise = new Promise<void>((resolveExit) => {
      child.once('exit', (code, signal) => {
        void this.handleExit(code, signal).finally(resolveExit);
      });
      child.once('error', (err) => {
        this.emit('spawn-error', { sessionId: session.sessionId, error: err });
        void this.handleExit(null, null, err).finally(resolveExit);
      });
    });

    const ctx: RunContext = {
      profile,
      settings,
      session,
      child,
      startedAt,
      listeningUrl: null,
      stopRequested: false,
      exitPromise,
    };
    this.current = ctx;

    this.setStatus({
      state: 'starting',
      profileId: profile.id,
      sessionId: session.sessionId,
      startedAt,
      pid: child.pid ?? null,
      listeningUrl: null,
    });

    const openEvent: SessionOpenEvent = {
      sessionId: session.sessionId,
      profileId: profile.id,
      rawLogPath: session.rawLogPath,
      metricsPath: session.metricsPath,
      sessionDir: session.dir,
      startedAt,
    };
    this.emit('session-open', openEvent);

    this.wireStdio(child, session.sessionId);
    return this.getStatus();
  }

  private wireStdio(child: ChildProcess, sessionId: string): void {
    const onLine = (stream: 'stdout' | 'stderr') => (text: string) => {
      const evt: LineEvent = { sessionId, stream, text };
      this.emit('line', evt);

      if (
        this.status.state === 'starting' &&
        text.startsWith('main: server is listening on ')
      ) {
        const url = text.substring('main: server is listening on '.length).trim();
        if (this.current) this.current.listeningUrl = url;
        this.setStatus({ ...this.status, state: 'running', listeningUrl: url });
      }
    };
    if (child.stdout) createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', onLine('stdout'));
    if (child.stderr) createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', onLine('stderr'));
  }

  private async handleExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    spawnError?: Error,
  ): Promise<void> {
    const ctx = this.current;
    if (!ctx) return;

    const crashed = !ctx.stopRequested && (code !== 0 || spawnError !== undefined);
    await finalizeSession(ctx.session, { exitCode: code, exitSignal: signal, crashed }).catch(() => {
      // best-effort; do not mask the original exit
    });

    const exit: ExitEvent = { sessionId: ctx.session.sessionId, code, signal, crashed };
    const closeEvent: SessionCloseEvent = {
      ...exit,
      profileId: ctx.profile.id,
      endedAt: new Date().toISOString(),
    };
    this.current = null;
    this.setStatus({
      state: crashed ? 'crashed' : 'stopped',
      profileId: null,
      sessionId: null,
      startedAt: null,
      pid: null,
      listeningUrl: null,
    });
    this.emit('exit', exit);
    this.emit('session-close', closeEvent);
  }

  private setStatus(next: ServerStatus): void {
    this.status = next;
    this.emit('status', this.getStatus());
  }
}

function idleStatus(): ServerStatus {
  return {
    state: 'idle',
    profileId: null,
    sessionId: null,
    startedAt: null,
    pid: null,
    listeningUrl: null,
  };
}

function assertSettingsComplete(settings: Settings): void {
  if (!settings.llamaServerBinaryPath) {
    throw new AppError('PRECONDITION_FAILED', 'llamaServerBinaryPath is not configured', {
      field: 'llamaServerBinaryPath',
    });
  }
  // modelsDir is only required for profiles using file-mode models; checked
  // inside buildModelArgs so HF-mode profiles can run without it.
}

function buildModelArgs(profile: Profile, settings: Settings): string[] {
  if (profile.modelSource === 'file') {
    if (!profile.modelFile) {
      throw new AppError('VALIDATION_ERROR', 'profile has modelSource=file but no modelFile', {
        field: 'modelFile',
      });
    }
    if (!settings.modelsDir) {
      throw new AppError('PRECONDITION_FAILED', 'modelsDir is not configured', { field: 'modelsDir' });
    }
    const modelAbs = resolveModelPath(settings.modelsDir, profile.modelFile);
    return ['--model', modelAbs];
  }
  if (profile.modelSource === 'hf') {
    if (!profile.modelRepo) {
      throw new AppError('VALIDATION_ERROR', 'profile has modelSource=hf but no modelRepo', {
        field: 'modelRepo',
      });
    }
    return ['-hf', profile.modelRepo];
  }
  throw new AppError('VALIDATION_ERROR', `unknown modelSource ${String(profile.modelSource)}`, {
    field: 'modelSource',
  });
}

function resolveModelPath(modelsDir: string, modelFile: string): string {
  if (modelFile.includes('/') || modelFile.includes('\\') || modelFile.includes('..')) {
    throw new AppError('VALIDATION_ERROR', 'modelFile must be a plain filename', {
      field: 'modelFile',
      value: modelFile,
    });
  }
  const dir = resolve(modelsDir);
  const abs = resolve(dir, modelFile);
  if (!abs.startsWith(`${dir}/`) && abs !== dir) {
    throw new AppError('VALIDATION_ERROR', 'modelFile escapes modelsDir', {
      field: 'modelFile',
      value: modelFile,
    });
  }
  return abs;
}

async function assertBinaryUsable(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new AppError('PRECONDITION_FAILED', 'llamaServerBinaryPath is not a file', {
        field: 'llamaServerBinaryPath',
        path,
      });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('PRECONDITION_FAILED', 'llamaServerBinaryPath is not usable', {
      field: 'llamaServerBinaryPath',
      path,
    });
  }
}

export const llamaServer = new LlamaServerFacade();
export type { LineEvent, ExitEvent, SessionOpenEvent, SessionCloseEvent };
