import test from 'node:test';
import { strict as assert } from 'node:assert';

import { flagName, tokenizeArgs } from './argsTokenizer.js';

test('tokenizer: plain whitespace split', () => {
  assert.deepEqual(tokenizeArgs('--ctx-size 65536 --jinja'), ['--ctx-size', '65536', '--jinja']);
});

test('tokenizer: leading/trailing whitespace is ignored', () => {
  assert.deepEqual(tokenizeArgs('   -ngl 99   '), ['-ngl', '99']);
});

test('tokenizer: empty string is empty tokens', () => {
  assert.deepEqual(tokenizeArgs(''), []);
  assert.deepEqual(tokenizeArgs('   '), []);
});

test('tokenizer: double-quoted token with spaces', () => {
  assert.deepEqual(tokenizeArgs('--chat-template "hello world"'), ['--chat-template', 'hello world']);
});

test('tokenizer: single-quoted token with spaces', () => {
  assert.deepEqual(tokenizeArgs("--grammar 'a b c'"), ['--grammar', 'a b c']);
});

test('tokenizer: mixed quotes concatenated into one token', () => {
  // mirrors shell: `--x="one"'two'` produces `--x=onetwo`
  assert.deepEqual(tokenizeArgs('--x="one"\'two\''), ['--x=onetwo']);
});

test('tokenizer: unclosed quote throws', () => {
  assert.throws(() => tokenizeArgs('--foo "bar'), /unclosed/);
});

test('flagName: short forms', () => {
  assert.equal(flagName('-m'), '-m');
  assert.equal(flagName('--model'), '--model');
  assert.equal(flagName('--model=foo'), '--model');
  assert.equal(flagName('-ngl=99'), '-ngl');
  assert.equal(flagName('positional'), 'positional');
});
