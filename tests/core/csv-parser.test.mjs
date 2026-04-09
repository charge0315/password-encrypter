import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  entriesToCSV,
  extractDomain,
  parsePasswordCSV,
} from '../../dist/core/csv-parser.js';

test('parsePasswordCSV parses rows and initializes workflow fields', () => {
  const csv = [
    'Name,URL,Username,Password,Note',
    'Example,https://www.example.com/settings,user@example.com,dummy-test-1234!,primary account',
    'Amazon,https://amazon.co.jp/ap/signin,shopper@example.com,dummy-test-5678!,shopping',
  ].join('\n');

  const entries = parsePasswordCSV(csv);

  assert.equal(entries.length, 2);
  assert.match(entries[0].id, /^entry-0-\d+$/);
  assert.match(entries[1].id, /^entry-1-\d+$/);
  assert.notEqual(entries[0].id, entries[1].id);
  assert.deepEqual(
    entries.map((entry) => ({
      name: entry.name,
      url: entry.url,
      username: entry.username,
      password: entry.password,
      note: entry.note,
      breachStatus: entry.breachStatus,
      changeStatus: entry.changeStatus,
    })),
    [
      {
        name: 'Example',
        url: 'https://www.example.com/settings',
        username: 'user@example.com',
        password: 'dummy-test-1234!',
        note: 'primary account',
        breachStatus: 'unchecked',
        changeStatus: 'pending',
      },
      {
        name: 'Amazon',
        url: 'https://amazon.co.jp/ap/signin',
        username: 'shopper@example.com',
        password: 'dummy-test-5678!',
        note: 'shopping',
        breachStatus: 'unchecked',
        changeStatus: 'pending',
      },
    ]
  );
});

test('entriesToCSV exports newPassword when it is available', () => {
  const csv = entriesToCSV([
    {
      id: 'entry-1',
      name: 'Example',
      url: 'https://example.com',
      username: 'user@example.com',
      password: 'old-password',
      newPassword: 'new-password',
      note: 'rotated',
      breachStatus: 'safe',
      changeStatus: 'success',
    },
  ]);

  const rows = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true,
  });

  assert.deepEqual(rows, [
    {
      name: 'Example',
      url: 'https://example.com',
      username: 'user@example.com',
      password: 'new-password',
      note: 'rotated',
    },
  ]);
});

test('extractDomain normalizes valid URLs and falls back for invalid ones', () => {
  assert.equal(
    extractDomain('https://www.example.com/account/security'),
    'example.com'
  );
  assert.equal(extractDomain('not-a-valid-url'), 'not-a-valid-url');
});
