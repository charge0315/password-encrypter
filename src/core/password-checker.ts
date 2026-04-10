import { createHash } from 'node:crypto';

const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';

export interface BreachCheckResult {
  isCompromised: boolean;
  count: number;
}

/**
 * Have I Been Pwned Passwords API (k-anonymity) でパスワードの漏洩を確認する
 *
 * パスワードのSHA-1ハッシュの先頭5文字のみをAPIに送信し、
 * レスポンスからローカルで照合するため、平文パスワードが外部に送信されることはない。
 *
 * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
 */
export async function checkPasswordBreach(
  password: string,
  apiKey?: string,
  userAgent?: string
): Promise<BreachCheckResult> {
  // SHA-1 ハッシュを計算
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.substring(0, 5);
  const suffix = sha1.substring(5);

  // API にプレフィックスのみ送信
  const headers: Record<string, string> = {
    'User-Agent': userAgent || 'password-auto-change-agent/1.0',
  };
  if (apiKey) {
    headers['hibp-api-key'] = apiKey;
  }

  const response = await fetch(`${HIBP_API_BASE}${prefix}`, { headers });

  if (!response.ok) {
    throw new Error(`HIBP API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();

  // レスポンスからサフィックスを検索
  const lines = text.split('\n');
  for (const line of lines) {
    const [hashSuffix, countStr] = line.trim().split(':');
    if (hashSuffix === suffix) {
      return {
        isCompromised: true,
        count: parseInt(countStr, 10),
      };
    }
  }

  return {
    isCompromised: false,
    count: 0,
  };
}

/**
 * 複数のパスワードエントリの漏洩を一括チェックする
 * レート制限を考慮し、リクエスト間に遅延を入れる
 */
export async function checkPasswordsBatch(
  passwords: { id: string; password: string }[],
  options: {
    apiKey?: string;
    userAgent?: string;
    delayMs?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<Map<string, BreachCheckResult>> {
  const { apiKey, userAgent, delayMs = 200, onProgress } = options;
  const results = new Map<string, BreachCheckResult>();

  for (let i = 0; i < passwords.length; i++) {
    const { id, password } = passwords[i];

    try {
      const result = await checkPasswordBreach(password, apiKey, userAgent);
      results.set(id, result);
    } catch (error) {
      console.error(`漏洩チェックエラー (entry ${id}):`, error);
      results.set(id, { isCompromised: false, count: -1 }); // エラー時はcount=-1
    }

    onProgress?.(i + 1, passwords.length);

    // レート制限対策の遅延
    if (i < passwords.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
