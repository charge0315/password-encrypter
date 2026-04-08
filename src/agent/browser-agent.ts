import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { access, mkdir } from 'node:fs/promises';
import { RecipeEngine, type SiteRecipe } from './recipe-engine.js';
import { analyzePageForPasswordChange } from './ai-analyzer.js';

export interface BrowserAgentOptions {
  /** ヘッドレスモード (デフォルト: false — GUI表示) */
  headless?: boolean;
  /** ブラウザのユーザーデータディレクトリ (セッション維持用) */
  userDataDir?: string;
  /** 操作のスローモーション (ms) */
  slowMo?: number;
}

export interface PasswordChangeResult {
  entryId: string;
  domain: string;
  success: boolean;
  method: 'recipe' | 'ai' | 'manual';
  error?: string;
  screenshots: string[];
  timestamp: string;
}

/**
 * ブラウザエージェント — Playwrightを使ったパスワード変更自動操作
 */
export class BrowserAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private recipeEngine: RecipeEngine;
  private options: BrowserAgentOptions;

  constructor(recipeEngine: RecipeEngine, options: BrowserAgentOptions = {}) {
    this.recipeEngine = recipeEngine;
    this.options = {
      headless: false,
      slowMo: 100,
      ...options,
    };
  }

  /** ブラウザを起動する */
  async launch(): Promise<void> {
    await this.ensureScreenshotDir();

    this.browser = await chromium.launch({
      headless: this.options.headless,
      slowMo: this.options.slowMo,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'ja-JP',
    });
  }

  /** ブラウザを終了する */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /** スクリーンショット保存先ディレクトリを保証する */
  private async ensureScreenshotDir(): Promise<void> {
    const path = 'data/screenshots';
    try {
      await access(path);
    } catch {
      await mkdir(path, { recursive: true });
    }
  }

  /** 新しいページを開く */
  private async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('ブラウザが起動されていません。launch() を呼び出してください。');
    }
    return this.context.newPage();
  }

  /**
   * パスワード変更を実行する
   *
   * 1. レシピがある場合 → レシピに従って自動操作
   * 2. レシピがない場合 → AI がページを解析して操作
   */
  async changePassword(params: {
    entryId: string;
    url: string;
    domain: string;
    username: string;
    oldPassword: string;
    newPassword: string;
    geminiApiKey?: string;
  }): Promise<PasswordChangeResult> {
    const { entryId, url, domain, username, oldPassword, newPassword, geminiApiKey } = params;
    const page = await this.newPage();

    const variables = {
      old_password: oldPassword,
      new_password: newPassword,
      username: username,
    };

    try {
      // レシピを検索
      const recipe = this.recipeEngine.findRecipe(domain);

      if (recipe) {
        // レシピモード
        console.log(`📝 [${domain}] レシピモードで実行`);
        const result = await this.recipeEngine.executeRecipe(page, recipe, variables);

        return {
          entryId,
          domain,
          success: result.success,
          method: 'recipe',
          error: result.error,
          screenshots: result.screenshots,
          timestamp: new Date().toISOString(),
        };
      } else if (geminiApiKey) {
        // AI解析モード
        console.log(`🤖 [${domain}] AI解析モードで実行`);
        const result = await this.executeWithAI(page, {
          url,
          domain,
          username,
          oldPassword,
          newPassword,
          geminiApiKey,
        });

        // レシピ学習: AI成功時にレシピとして自動保存
        if (result.success && result.learnedSteps) {
          try {
            this.recipeEngine.saveLearnedRecipe(
              domain,
              domain,
              url,
              result.learnedSteps
            );
          } catch (err) {
            console.warn(`レシピ保存エラー: ${err}`);
          }
        }

        return {
          entryId,
          domain,
          success: result.success,
          method: 'ai',
          error: result.error,
          screenshots: result.screenshots,
          timestamp: new Date().toISOString(),
        };
      } else {
        // マニュアルモード — ページを表示してユーザーに操作を委ねる
        console.log(`👤 [${domain}] マニュアルモード（AI APIキー未設定）`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        return {
          entryId,
          domain,
          success: false,
          method: 'manual',
          error: 'AI APIキーが設定されていないため、手動操作が必要です',
          screenshots: [],
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      return {
        entryId,
        domain,
        success: false,
        method: 'recipe',
        error: error.message || String(error),
        screenshots: [],
        timestamp: new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * AI解析モードでパスワード変更を実行
   */
  private async executeWithAI(
    page: Page,
    params: {
      url: string;
      domain: string;
      username: string;
      oldPassword: string;
      newPassword: string;
      geminiApiKey: string;
    }
  ): Promise<{ success: boolean; error?: string; screenshots: string[]; learnedSteps?: Array<{ action: string; selector?: string; value?: string; description?: string }> }> {
    const screenshots: string[] = [];

    try {
      // 1. パスワード変更ページに移動
      await page.goto(params.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // 2. ページのHTMLを取得してAIに解析させる
      const pageContent = await page.content();
      const pageTitle = await page.title();
      const currentUrl = page.url();

      const analysis = await analyzePageForPasswordChange({
        html: pageContent,
        title: pageTitle,
        url: currentUrl,
        domain: params.domain,
        apiKey: params.geminiApiKey,
      });

      if (!analysis.isPasswordChangePage) {
        // パスワード変更ページではない — リンクを探す
        if (analysis.passwordChangeLink) {
          await page.goto(analysis.passwordChangeLink, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);

          // 再度解析
          const newContent = await page.content();
          const newTitle = await page.title();
          const newUrl = page.url();

          const reanalysis = await analyzePageForPasswordChange({
            html: newContent,
            title: newTitle,
            url: newUrl,
            domain: params.domain,
            apiKey: params.geminiApiKey,
          });

          if (!reanalysis.isPasswordChangePage || !reanalysis.steps) {
            return {
              success: false,
              error: 'パスワード変更ページを特定できませんでした',
              screenshots,
            };
          }

          // AIが生成したステップを実行
          const result = await this.executeAISteps(page, reanalysis.steps, params, screenshots);
          return { ...result, learnedSteps: result.success ? reanalysis.steps : undefined };
        }

        return {
          success: false,
          error: 'パスワード変更フォームが見つかりませんでした',
          screenshots,
        };
      }

      if (!analysis.steps) {
        return {
          success: false,
          error: 'AIがパスワード変更手順を生成できませんでした',
          screenshots,
        };
      }

      // AIが生成したステップを実行
      const result = await this.executeAISteps(page, analysis.steps, params, screenshots);
      return { ...result, learnedSteps: result.success ? analysis.steps : undefined };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        screenshots,
      };
    }
  }

  /** AIが分析したステップを実行する */
  private async executeAISteps(
    page: Page,
    steps: Array<{ action: string; selector?: string; value?: string }>,
    params: {
      domain: string;
      oldPassword: string;
      newPassword: string;
      username: string;
    },
    screenshots: string[]
  ): Promise<{ success: boolean; error?: string; screenshots: string[] }> {
    try {
      for (const step of steps) {
        switch (step.action) {
          case 'fill': {
            if (!step.selector || !step.value) break;
            let value = step.value;
            if (value === '{{old_password}}') value = params.oldPassword;
            else if (value === '{{new_password}}') value = params.newPassword;
            else if (value === '{{username}}') value = params.username;
            await page.waitForSelector(step.selector, { timeout: 10000 });
            await page.fill(step.selector, value);
            break;
          }
          case 'click': {
            if (!step.selector) break;
            await page.waitForSelector(step.selector, { timeout: 10000 });
            await page.click(step.selector);
            break;
          }
        }
      }

      // 変更完了の確認を待つ
      await page.waitForTimeout(3000);

      const screenshotPath = `data/screenshots/ai-result-${params.domain.replace(/[^a-zA-Z0-9]/g,'_')}-${Date.now()}.png`;
      try {
        await this.ensureScreenshotDir();
        await page.screenshot({ path: screenshotPath });
        screenshots.push(screenshotPath);
      } catch (error) {
        console.warn('スクリーンショット保存に失敗しました:', error);
      }

      return { success: true, screenshots };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        screenshots,
      };
    }
  }
}
