import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../../dist/agent/orchestrator.js';

function createEntry(overrides = {}) {
  return {
    id: 'entry-1',
    name: 'Example',
    url: 'https://example.com/security',
    username: 'user@example.com',
    password: 'old-password',
    note: '',
    breachStatus: 'unchecked',
    changeStatus: 'pending',
    ...overrides,
  };
}

test('executeBatchChange marks successful changes and updates the stored password', async () => {
  let launched = false;
  let closed = false;
  let receivedParams;

  const orchestrator = new Orchestrator({
    browserAgentFactory: () => ({
      async launch() {
        launched = true;
      },
      async close() {
        closed = true;
      },
      async changePassword(params) {
        receivedParams = params;
        return {
          entryId: params.entryId,
          domain: params.domain,
          success: true,
          method: 'recipe',
          screenshots: [],
          timestamp: '2025-01-01T00:00:00.000Z',
        };
      },
    }),
  });

  orchestrator.setEntries([
    createEntry({
      newPassword: 'new-password',
    }),
  ]);

  const results = await orchestrator.executeBatchChange();
  const [entry] = orchestrator.getEntries();

  assert.equal(launched, true);
  assert.equal(closed, true);
  assert.equal(results.length, 1);
  assert.equal(receivedParams.newPassword, 'new-password');
  assert.equal(entry.password, 'new-password');
  assert.equal(entry.newPassword, undefined);
  assert.equal(entry.changeStatus, 'success');
});

test('executeBatchChange marks manual handoff as skipped and keeps the generated password', async () => {
  const orchestrator = new Orchestrator({
    browserAgentFactory: () => ({
      async launch() {},
      async close() {},
      async changePassword(params) {
        return {
          entryId: params.entryId,
          domain: params.domain,
          success: false,
          method: 'manual',
          error: '手動対応に切り替えました。変更後にタブを閉じると続行します。',
          screenshots: [],
          timestamp: '2025-01-01T00:00:00.000Z',
        };
      },
    }),
  });

  orchestrator.setEntries([
    createEntry({
      id: 'entry-2',
      newPassword: 'manual-password',
    }),
  ]);

  const results = await orchestrator.executeBatchChange();
  const [entry] = orchestrator.getEntries();

  assert.equal(results.length, 1);
  assert.equal(entry.password, 'old-password');
  assert.equal(entry.newPassword, 'manual-password');
  assert.equal(entry.changeStatus, 'skipped');
  assert.equal(entry.errorMessage?.includes('手動対応'), true);
});

test('completeManualChange marks a skipped entry as success and applies the generated password', () => {
  const orchestrator = new Orchestrator();

  orchestrator.setEntries([
    createEntry({
      id: 'entry-3',
      password: 'before-manual',
      newPassword: 'after-manual',
      changeStatus: 'skipped',
      errorMessage: '手動対応に切り替えました。',
    }),
  ]);

  const result = orchestrator.completeManualChange('entry-3');
  const [entry] = orchestrator.getEntries();

  assert.equal(result.method, 'manual');
  assert.equal(result.success, true);
  assert.equal(entry.password, 'after-manual');
  assert.equal(entry.newPassword, undefined);
  assert.equal(entry.changeStatus, 'success');
  assert.equal(entry.errorMessage, undefined);
});
