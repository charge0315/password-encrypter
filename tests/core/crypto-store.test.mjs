import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CryptoStore,
  decrypt,
  encrypt,
} from '../../dist/core/crypto-store.js';

const tempDirs = [];

function createTempDir() {
  const baseDir = join(process.cwd(), 'tests', '.tmp');
  mkdirSync(baseDir, { recursive: true });

  const dir = mkdtempSync(join(baseDir, 'crypto-store-'));
  tempDirs.push(dir);
  return dir;
}

test.afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('encrypt and decrypt round-trip without exposing plaintext', () => {
  const plaintext = JSON.stringify({ message: 'hello world' });
  const encrypted = encrypt(plaintext, 'master-password');

  assert.equal(encrypted.includes('hello world'), false);
  assert.equal(decrypt(encrypted, 'master-password'), plaintext);
});

test('CryptoStore saves and loads structured data', () => {
  const tempDir = createTempDir();
  const storePath = join(tempDir, 'store.encrypted');
  const store = new CryptoStore('master-password', storePath);
  const payload = {
    entries: [{ id: 'entry-1', password: 'masked' }],
    results: [{ entryId: 'entry-1', success: true }],
    savedAt: '2025-01-01T00:00:00.000Z',
  };

  store.save(payload);

  assert.equal(existsSync(storePath), true);
  assert.equal(store.exists(), true);
  assert.equal(store.verify(), true);
  assert.deepEqual(store.load(), payload);
});

test('CryptoStore.verify returns false for the wrong password', () => {
  const tempDir = createTempDir();
  const storePath = join(tempDir, 'store.encrypted');
  const store = new CryptoStore('correct-password', storePath);

  store.save({ value: 'secret' });

  const invalidStore = new CryptoStore('wrong-password', storePath);
  assert.equal(invalidStore.verify(), false);
});
