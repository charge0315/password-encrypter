import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
  scryptSync,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_DIGEST = 'sha512';

/** 暗号化されたデータのフォーマット */
interface EncryptedPayload {
  version: number;
  salt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  data: string; // hex
}

/**
 * マスターパスワードから暗号鍵を導出する (PBKDF2)
 */
function deriveKey(masterPassword: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * データを AES-256-GCM で暗号化する
 */
export function encrypt(plaintext: string, masterPassword: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterPassword, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  };

  return JSON.stringify(payload);
}

/**
 * AES-256-GCM で暗号化されたデータを復号する
 */
export function decrypt(encryptedJson: string, masterPassword: string): string {
  const payload: EncryptedPayload = JSON.parse(encryptedJson);

  if (payload.version !== 1) {
    throw new Error(`未対応の暗号化バージョン: ${payload.version}`);
  }

  const salt = Buffer.from(payload.salt, 'hex');
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const encrypted = Buffer.from(payload.data, 'hex');

  const key = deriveKey(masterPassword, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * 暗号化ストレージ — ファイルにデータを暗号化して保存/読み込みする
 */
export class CryptoStore {
  private masterPassword: string;
  private storePath: string;

  constructor(masterPassword: string, storePath: string) {
    this.masterPassword = masterPassword;
    this.storePath = storePath;
  }

  /**
   * データを暗号化してファイルに保存する
   */
  save(data: unknown): void {
    const json = JSON.stringify(data, null, 2);
    const encrypted = encrypt(json, this.masterPassword);

    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.storePath, encrypted, 'utf-8');
  }

  /**
   * 暗号化されたファイルからデータを復号して読み込む
   */
  load<T = unknown>(): T | null {
    if (!existsSync(this.storePath)) {
      return null;
    }

    const encrypted = readFileSync(this.storePath, 'utf-8');
    const json = decrypt(encrypted, this.masterPassword);
    return JSON.parse(json) as T;
  }

  /**
   * ストアが存在するか確認する
   */
  exists(): boolean {
    return existsSync(this.storePath);
  }

  /**
   * マスターパスワードが正しいか検証する
   */
  verify(): boolean {
    try {
      this.load();
      return true;
    } catch {
      return false;
    }
  }
}
