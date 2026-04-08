import { randomBytes } from 'node:crypto';

/** パスワード生成オプション */
export interface PasswordOptions {
  /** パスワードの長さ (デフォルト: 20) */
  length?: number;
  /** 大文字を含む (デフォルト: true) */
  uppercase?: boolean;
  /** 小文字を含む (デフォルト: true) */
  lowercase?: boolean;
  /** 数字を含む (デフォルト: true) */
  digits?: boolean;
  /** 記号を含む (デフォルト: true) */
  symbols?: boolean;
  /** 使用する記号文字 (デフォルト: '!@#$%^&*()_+-=[]{}|;:,.<>?') */
  symbolChars?: string;
  /** 除外する文字 */
  excludeChars?: string;
  /** 曖昧な文字を除外する (0Oo, 1lI 等) */
  excludeAmbiguous?: boolean;
}

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS_DEFAULT = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const AMBIGUOUS = '0Oo1lI';

/**
 * 暗号的に安全なランダムパスワードを生成する
 *
 * crypto.randomBytes を使用し、偏りのないランダム選択を実現する。
 * 各文字種が最低1文字含まれることを保証する。
 */
export function generatePassword(options: PasswordOptions = {}): string {
  const {
    length = 20,
    uppercase = true,
    lowercase = true,
    digits = true,
    symbols = true,
    symbolChars = SYMBOLS_DEFAULT,
    excludeChars = '',
    excludeAmbiguous = false,
  } = options;

  // 使用可能な文字セットを構築
  let charset = '';
  const requiredChars: string[] = [];

  const filterChars = (chars: string): string => {
    let filtered = chars;
    if (excludeAmbiguous) {
      filtered = filtered
        .split('')
        .filter((c) => !AMBIGUOUS.includes(c))
        .join('');
    }
    if (excludeChars) {
      filtered = filtered
        .split('')
        .filter((c) => !excludeChars.includes(c))
        .join('');
    }
    return filtered;
  };

  if (uppercase) {
    const chars = filterChars(UPPERCASE);
    charset += chars;
    if (chars.length > 0) requiredChars.push(secureRandomChar(chars));
  }
  if (lowercase) {
    const chars = filterChars(LOWERCASE);
    charset += chars;
    if (chars.length > 0) requiredChars.push(secureRandomChar(chars));
  }
  if (digits) {
    const chars = filterChars(DIGITS);
    charset += chars;
    if (chars.length > 0) requiredChars.push(secureRandomChar(chars));
  }
  if (symbols) {
    const chars = filterChars(symbolChars);
    charset += chars;
    if (chars.length > 0) requiredChars.push(secureRandomChar(chars));
  }

  if (charset.length === 0) {
    throw new Error('使用可能な文字がありません。オプションを確認してください。');
  }

  const actualLength = Math.max(length, requiredChars.length);

  // 残りの文字をランダムに生成
  const remainingLength = actualLength - requiredChars.length;
  const passwordChars = [...requiredChars];

  for (let i = 0; i < remainingLength; i++) {
    passwordChars.push(secureRandomChar(charset));
  }

  // Fisher-Yates シャッフル（暗号的に安全なランダム）
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

/**
 * パスワードの強度を評価する
 * @returns スコア 0-100
 */
export function evaluatePasswordStrength(password: string): {
  score: number;
  level: 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  // 長さ評価
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;
  if (password.length < 8) feedback.push('8文字以上を推奨します');

  // 文字種の多様性
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push('小文字を含めてください');
  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push('大文字を含めてください');
  if (/[0-9]/.test(password)) score += 10;
  else feedback.push('数字を含めてください');
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  else feedback.push('記号を含めてください');

  // ユニーク文字数
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.7) score += 15;

  score = Math.min(100, score);

  let level: 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';
  if (score < 20) level = 'very-weak';
  else if (score < 40) level = 'weak';
  else if (score < 60) level = 'fair';
  else if (score < 80) level = 'strong';
  else level = 'very-strong';

  return { score, level, feedback };
}

/** 暗号的に安全なランダム文字を選択 */
function secureRandomChar(charset: string): string {
  return charset[secureRandomInt(charset.length)];
}

/** 0以上max未満の暗号的に安全なランダム整数を生成 */
function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  // バイアスを排除するためのリジェクション法
  const bytesNeeded = Math.ceil(Math.log2(max) / 8) || 1;
  const maxValid = Math.floor(256 ** bytesNeeded / max) * max;

  let value: number;
  do {
    const bytes = randomBytes(bytesNeeded);
    value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = value * 256 + bytes[i];
    }
  } while (value >= maxValid);

  return value % max;
}
