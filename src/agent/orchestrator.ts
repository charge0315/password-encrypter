import { type PasswordEntry } from '../core/csv-parser.js';
import { generatePassword, type PasswordOptions } from '../core/password-generator.js';
import { checkPasswordsBatch } from '../core/password-checker.js';
import { CryptoStore } from '../core/crypto-store.js';
import {
  BrowserAgent,
  type ChangePasswordParams,
  type PasswordChangeResult,
} from './browser-agent.js';
import { RecipeEngine, type SiteRecipe } from './recipe-engine.js';
import { extractDomain } from '../core/csv-parser.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type OrchestratorEvent =
  | { type: 'breach-check-start'; total: number }
  | { type: 'breach-check-progress'; completed: number; total: number }
  | { type: 'breach-check-complete'; compromisedCount: number }
  | { type: 'password-change-start'; entryId: string; domain: string }
  | { type: 'password-change-complete'; result: PasswordChangeResult }
  | { type: 'batch-complete'; results: PasswordChangeResult[] }
  | { type: 'error'; message: string };

export interface BrowserAgentAdapter {
  launch(): Promise<void>;
  close(): Promise<void>;
  changePassword(params: ChangePasswordParams): Promise<PasswordChangeResult>;
}

/**
 * オーケストレーター — エージェント全体の制御を担当
 */
export class Orchestrator {
  private entries: PasswordEntry[] = [];
  private recipeEngine: RecipeEngine;
  private browserAgent: BrowserAgentAdapter | null = null;
  private cryptoStore: CryptoStore | null = null;
  private eventListeners: ((event: OrchestratorEvent) => void)[] = [];
  private results: PasswordChangeResult[] = [];
  private browserAgentFactory: (recipeEngine: RecipeEngine) => BrowserAgentAdapter;

  // 設定
  private config: {
    masterPassword?: string;
    hibpApiKey?: string;
    geminiApiKey?: string;
    recipesDir?: string;
    storePath?: string;
    browserAgentFactory?: (recipeEngine: RecipeEngine) => BrowserAgentAdapter;
  };

  constructor(config: {
    masterPassword?: string;
    hibpApiKey?: string;
    geminiApiKey?: string;
    recipesDir?: string;
    storePath?: string;
    browserAgentFactory?: (recipeEngine: RecipeEngine) => BrowserAgentAdapter;
  } = {}) {
    this.config = config;
    this.recipeEngine = new RecipeEngine();
    this.browserAgentFactory =
      config.browserAgentFactory ||
      ((recipeEngine) => new BrowserAgent(recipeEngine, { headless: false }));

    // 暗号化ストレージの初期化
    if (config.masterPassword && config.storePath) {
      this.cryptoStore = new CryptoStore(config.masterPassword, config.storePath);
    }

    // レシピの読み込み
    this.loadRecipes();
  }

  /** イベントリスナーを追加 */
  on(listener: (event: OrchestratorEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /** パスワードエントリを設定する */
  setEntries(entries: PasswordEntry[]): void {
    this.entries = entries;
  }

  /** 現在のエントリを取得する */
  getEntries(): PasswordEntry[] {
    return this.entries;
  }

  /** 変更結果を取得する */
  getResults(): PasswordChangeResult[] {
    return this.results;
  }

  /** レシピエンジンを取得する */
  getRecipeEngine(): RecipeEngine {
    return this.recipeEngine;
  }

  /**
   * 漏洩チェックを実行する
   */
  async checkBreaches(): Promise<void> {
    const passwords = this.entries.map((e) => ({
      id: e.id,
      password: e.password,
    }));

    this.emit({ type: 'breach-check-start', total: passwords.length });

    const results = await checkPasswordsBatch(passwords, {
      apiKey: this.config.hibpApiKey,
      onProgress: (completed, total) => {
        this.emit({ type: 'breach-check-progress', completed, total });
      },
    });

    let compromisedCount = 0;
    for (const entry of this.entries) {
      const result = results.get(entry.id);
      if (result) {
        if (result.count === -1) {
          entry.breachStatus = 'unchecked';
        } else if (result.isCompromised) {
          entry.breachStatus = 'compromised';
          entry.breachCount = result.count;
          compromisedCount++;
        } else {
          entry.breachStatus = 'safe';
          entry.breachCount = 0;
        }
      }
    }

    this.emit({ type: 'breach-check-complete', compromisedCount });
  }

  /**
   * 新しいパスワードを一括生成する
   */
  generateNewPasswords(
    filter?: (entry: PasswordEntry) => boolean,
    options?: PasswordOptions
  ): void {
    const targets = filter ? this.entries.filter(filter) : this.entries;

    for (const entry of targets) {
      const domain = extractDomain(entry.url);
      const recipe = this.recipeEngine.findRecipe(domain);

      // レシピにパスワード制約がある場合はそれに従う
      const pwOptions: PasswordOptions = {
        length: 20,
        ...options,
      };

      if (recipe?.passwordConstraints) {
        const c = recipe.passwordConstraints;
        if (c.maxLength) pwOptions.length = Math.min(pwOptions.length || 20, c.maxLength);
        if (c.minLength)
          pwOptions.length = Math.max(pwOptions.length || 20, c.minLength);
        if (c.allowedSymbols) pwOptions.symbolChars = c.allowedSymbols;
        if (c.excludeChars) pwOptions.excludeChars = c.excludeChars;
        if (c.requireUppercase !== undefined) pwOptions.uppercase = c.requireUppercase;
        if (c.requireLowercase !== undefined) pwOptions.lowercase = c.requireLowercase;
        if (c.requireDigits !== undefined) pwOptions.digits = c.requireDigits;
        if (c.requireSymbols !== undefined) pwOptions.symbols = c.requireSymbols;
      }

      entry.newPassword = generatePassword(pwOptions);
    }
  }

  /**
   * パスワード変更を一括実行する
   */
  async executeBatchChange(
    entryIds?: string[]
  ): Promise<PasswordChangeResult[]> {
    const targets = entryIds
      ? this.entries.filter((e) => entryIds.includes(e.id))
      : this.entries.filter((e) => e.newPassword && e.changeStatus === 'pending');

    if (targets.length === 0) {
      return [];
    }

    // ブラウザエージェントを起動
    const browserAgent = this.browserAgentFactory(this.recipeEngine);
    this.browserAgent = browserAgent;
    await browserAgent.launch();

    const results: PasswordChangeResult[] = [];

    try {
      for (const entry of targets) {
        if (!entry.newPassword) continue;

        entry.changeStatus = 'in-progress';
        const domain = extractDomain(entry.url);

        this.emit({
          type: 'password-change-start',
          entryId: entry.id,
          domain,
        });

        const result = await browserAgent.changePassword({
          entryId: entry.id,
          url: entry.url,
          domain,
          username: entry.username,
          oldPassword: entry.password,
          newPassword: entry.newPassword,
          geminiApiKey: this.config.geminiApiKey,
        });

        entry.errorMessage = result.error;
        if (result.method === 'manual') {
          entry.changeStatus = 'skipped';
        } else {
          entry.changeStatus = result.success ? 'success' : 'failed';
        }

        // 成功した場合、古いパスワードを更新
        if (result.success) {
          entry.password = entry.newPassword;
          entry.newPassword = undefined;
        }

        results.push(result);
        this.emit({ type: 'password-change-complete', result });
      }
    } finally {
      await browserAgent.close();
      this.browserAgent = null;
    }

    this.results.push(...results);
    this.emit({ type: 'batch-complete', results });

    // 暗号化ストレージに保存
    this.saveToStore();

    return results;
  }

  /** データを暗号化ストレージに保存 */
  saveToStore(): void {
    if (this.cryptoStore) {
      this.cryptoStore.save({
        entries: this.entries,
        results: this.results,
        savedAt: new Date().toISOString(),
      });
    }
  }

  /** 暗号化ストレージからデータを復元 */
  loadFromStore(): boolean {
    if (!this.cryptoStore || !this.cryptoStore.exists()) {
      return false;
    }

    try {
      const data = this.cryptoStore.load<{
        entries: PasswordEntry[];
        results: PasswordChangeResult[];
      }>();
      if (data) {
        this.entries = data.entries;
        this.results = data.results || [];
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  /** レシピファイルを読み込む */
  private loadRecipes(): void {
    const candidateDirs = this.config.recipesDir
      ? [this.config.recipesDir]
      : [
          join(process.cwd(), 'recipes'),
          join(process.cwd(), 'src', 'recipes'),
        ];

    const recipesDir = candidateDirs.find((dir) => existsSync(dir));
    if (!recipesDir) {
      return;
    }

    try {
      const files = readdirSync(recipesDir).filter(
        (f) => f.endsWith('.json') && f !== 'schema.json'
      );
      for (const file of files) {
        try {
          const content = readFileSync(join(recipesDir, file), 'utf-8');
          const recipe: SiteRecipe = JSON.parse(content);
          this.recipeEngine.addRecipe(recipe);
        } catch (err) {
          console.warn(`レシピ読み込みエラー (${file}):`, err);
        }
      }
    } catch {
      // レシピディレクトリが読めない場合は無視
    }
  }
}
