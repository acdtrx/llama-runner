import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { strict as assert } from 'node:assert';

import { MetricsParser } from './parser.js';
import type { ParserEvent } from './types.js';

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'llama-server.log',
);

function runParser(): { events: ParserEvent[]; parser: MetricsParser; lineCount: number } {
  const body = readFileSync(FIXTURE_PATH, 'utf8');
  const lines = body.split(/\r?\n/);
  const parser = new MetricsParser();
  const events: ParserEvent[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    for (const evt of parser.feed(line)) events.push(evt);
  }
  return { events, parser, lineCount: lines.length };
}

test('parser: startup metrics extracted from fixture', () => {
  const { events, parser } = runParser();
  const startupEvents = events.filter((e) => e.type === 'startup');
  assert.equal(startupEvents.length, 1, 'exactly one startup event');

  const { startup } = parser.getSnapshot();
  assert.equal(startup.listeningUrl, 'http://0.0.0.0:11434');
  assert.equal(startup.buildInfo, 'b8680-15f786e65');
  assert.equal(startup.backend, 'metal');
  assert.equal(startup.deviceName, 'Apple M4');
  assert.equal(startup.deviceFreeMiB, 12123);
  assert.equal(startup.threads, 4);
  assert.ok(startup.simdFeatures && startup.simdFeatures.includes('NEON'));
  assert.ok(startup.simdFeatures && startup.simdFeatures.includes('ACCELERATE'));

  assert.equal(startup.model.filename, 'gemma-4-E4B-it-Q8_0.gguf');
  assert.equal(startup.model.fileFormat, 'GGUF V3 (latest)');
  assert.equal(startup.model.fileType, 'Q8_0');
  assert.equal(startup.model.fileSizeGiB, 7.62);
  assert.equal(startup.model.bpw, 8.70);
  assert.equal(startup.model.architecture, 'gemma4');
  assert.equal(startup.model.contextLengthTrained, 131072);
  assert.equal(startup.model.sizeLabel, '7.5B');
  assert.equal(startup.model.quantizedBy, 'Unsloth');

  assert.equal(startup.context.nCtx, 65536);
  assert.equal(startup.context.nCtxSeq, 65536);
  assert.equal(startup.context.nBatch, 2048);
  assert.equal(startup.context.nUbatch, 512);
  assert.equal(startup.context.flashAttn, 'auto');

  assert.equal(startup.kvCache.primaryMiB, 1024);
  assert.equal(startup.kvCache.swaMiB, 40);
  assert.equal(startup.kvCache.totalMiB, 1064);
  assert.ok((startup.kvCache.computeBufferMiB ?? 0) > 0, 'compute buffer accumulated');

  assert.equal(startup.promptCacheLimitMiB, 8192);
  assert.equal(startup.promptCacheLimitTokens, 65536);
});

test('parser: emits one request event per print_timing+release block', () => {
  const { events, parser } = runParser();
  const requestEvents = events.filter((e) => e.type === 'request');
  assert.ok(requestEvents.length > 0, 'at least one request event');

  const { totals, requests } = parser.getSnapshot();
  assert.equal(totals.requests, requestEvents.length);
  assert.ok(requests.length <= 100, 'ring buffer capped at 100');
  assert.ok(totals.promptTokens > 0);
  assert.ok(totals.generatedTokens > 0);
});

test('parser: task 57753 timing matches fixture lines 1604-1607', () => {
  const { events } = runParser();
  const target = events.find(
    (e) => e.type === 'request' && e.request.taskId === 57753,
  );
  assert.ok(target && target.type === 'request', 'task 57753 found');
  const r = target.request;
  assert.equal(r.slotId, 0);
  assert.equal(r.endpoint, '/v1/chat/completions');
  assert.equal(r.httpMethod, 'POST');
  assert.equal(r.httpStatus, 200);
  assert.equal(r.promptTokens, 2301);
  assert.equal(r.generatedTokens, 515);
  assert.equal(r.promptTokensPerSecond, 228.68);
  assert.equal(r.generationTokensPerSecond, 15.57);
  assert.equal(r.promptEvalMs, 10062.18);
  assert.equal(r.evalMs, 33069.89);
  assert.equal(r.totalMs, 43132.07);
  assert.equal(r.finalNTokens, 24939);
});

test('parser: LCP similarity attached to task 58490', () => {
  const { events } = runParser();
  const target = events.find(
    (e) => e.type === 'request' && e.request.taskId === 58490,
  );
  assert.ok(target && target.type === 'request');
  assert.equal(target.request.cacheSimilarity, 0.991);
});

test('parser: cache events emitted with summary + prompts', () => {
  const { events, parser } = runParser();
  const cacheEvents = events.filter((e) => e.type === 'cache');
  assert.ok(cacheEvents.length > 0, 'at least one cache update');

  // After the known 6-prompt update (fixture line 1614), cache should reflect
  // the latest snapshot in parser.getSnapshot().cache.
  const cache = parser.getSnapshot().cache;
  assert.ok(cache, 'cache snapshot present after fixture');
  assert.equal(cache!.limitMiB, 8192);
  assert.equal(cache!.limitTokens, 65536);
  assert.ok(cache!.promptsStored >= 0);
});

test('parser: fixture produces zero error/warn events', () => {
  const { events, parser } = runParser();
  const errorEvents = events.filter((e) => e.type === 'error');
  assert.equal(errorEvents.length, 0);
  assert.equal(parser.getSnapshot().totals.errors, 0);
});

test('parser: schema version is 1', () => {
  const { parser } = runParser();
  assert.equal(parser.getSnapshot().schemaVersion, 1);
});

test('parser: event counts on fixture are stable (regression guard)', () => {
  const { events, parser } = runParser();
  const counts = {
    startup: events.filter((e) => e.type === 'startup').length,
    request: events.filter((e) => e.type === 'request').length,
    cache: events.filter((e) => e.type === 'cache').length,
    error: events.filter((e) => e.type === 'error').length,
  };
  // Observed baseline from the committed llama-server.log fixture.
  // Any parser change that shifts these numbers should force a deliberate
  // re-read of the fixture before updating the expected values.
  assert.equal(counts.startup, 1);
  assert.equal(counts.request, 104);
  assert.equal(counts.cache, 26);
  assert.equal(counts.error, 0);

  const totals = parser.getSnapshot().totals;
  assert.equal(totals.requests, 104);
  assert.equal(totals.promptTokens, 252936);
  assert.equal(totals.generatedTokens, 77127);
  assert.equal(totals.cacheHits, 90);
});
