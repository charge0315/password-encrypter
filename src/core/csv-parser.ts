import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFileSync } from 'node:fs';

/** Google Password Manager CSV の1行分のデータ */
export interface PasswordEntry {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  note: string;
  /** 漏洩チェック結果 */
  breachStatus?: 'compromised' | 'safe' | 'unchecked';
  /** 漏洩回数 */
  breachCount?: number;
  /** 新しいパスワード（生成済みの場合） */
  newPassword?: string;
  /** 変更ステータス */
  changeStatus?: 'pending' | 'in-progress' | 'success' | 'failed' | 'skipped';
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * Google Password Manager からエクスポートされた CSV を解析する
 */
export function parsePasswordCSV(csvContent: string): PasswordEntry[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  return records.map((record, index) => ({
    id: `entry-${index}-${Date.now()}`,
    name: record['name'] || record['Name'] || '',
    url: record['url'] || record['URL'] || '',
    username: record['username'] || record['Username'] || '',
    password: record['password'] || record['Password'] || '',
    note: record['note'] || record['Note'] || record['notes'] || record['Notes'] || '',
    breachStatus: 'unchecked' as const,
    changeStatus: 'pending' as const,
  }));
}

/**
 * CSV ファイルを読み込んで解析する
 */
export function parsePasswordCSVFile(filePath: string): PasswordEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  return parsePasswordCSV(content);
}

/**
 * パスワードエントリをCSV文字列に変換する（Google Password Manager インポート用）
 */
export function entriesToCSV(entries: PasswordEntry[]): string {
  const data = entries.map((entry) => ({
    name: entry.name,
    url: entry.url,
    username: entry.username,
    password: entry.newPassword || entry.password,
    note: entry.note,
  }));

  return stringify(data, {
    header: true,
    columns: ['name', 'url', 'username', 'password', 'note'],
  });
}

/**
 * URLからドメイン名を抽出する
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
