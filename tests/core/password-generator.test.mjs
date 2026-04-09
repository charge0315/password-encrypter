import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePasswordStrength,
  generatePassword,
} from '../../dist/core/password-generator.js';

test('generatePassword includes every enabled character class', () => {
  const password = generatePassword({ length: 24 });

  assert.equal(password.length, 24);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);
  assert.match(password, /[^a-zA-Z0-9]/);
});

test('generatePassword respects excluded and ambiguous characters', () => {
  const password = generatePassword({
    length: 40,
    symbols: false,
    excludeAmbiguous: true,
    excludeChars: 'ABCxyz89',
  });

  assert.equal(password.length, 40);
  assert.equal(/[^a-zA-Z0-9]/.test(password), false);

  for (const char of '0Oo1lIABCxyz89') {
    assert.equal(password.includes(char), false, `unexpected character: ${char}`);
  }
});

test('generatePassword throws when no characters are available', () => {
  assert.throws(
    () =>
      generatePassword({
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    /使用可能な文字がありません。オプションを確認してください。/
  );
});

test('evaluatePasswordStrength scores weak and strong passwords differently', () => {
  const weak = evaluatePasswordStrength('aaa');
  const strong = evaluatePasswordStrength('Test1234!@#$abcdEFGHtest');

  assert.equal(weak.level, 'very-weak');
  assert.equal(weak.feedback.includes('8文字以上を推奨します'), true);

  assert.equal(strong.level, 'very-strong');
  assert.equal(strong.score >= 80, true);
  assert.deepEqual(strong.feedback, []);
});
