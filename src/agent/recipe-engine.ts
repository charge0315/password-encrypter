/**
 * サイトレシピ — パスワード変更手順の JSON 定義
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function ensureScreenshotDir(): void {
  const dir = join(process.cwd(), 'data', 'screenshots');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** レシピのアクション定義 */
export type RecipeAction =
  | { action: 'goto'; url: string }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'click'; selector: string }
  | { action: 'waitForText'; text: string; timeout?: number }
  | { action: 'waitForSelector'; selector: string; timeout?: number }
  | { action: 'waitForNavigation'; timeout?: number }
  | { action: 'screenshot'; name?: string }
  | { action: 'pause'; ms: number }
  | { action: 'pressKey'; key: string };

/** サイトレシピ定義 */
export interface SiteRecipe {
  site: string;
  displayName: string;
  /** ログインが必要かどうか */
  requiresLogin: boolean;
  /** ログインURL */
  loginUrl?: string;
  /** パスワード変更ページのURL */
  changePasswordUrl: string;
  /** パスワード変更手順 */
  steps: RecipeAction[];
  /** パスワード制約 */
  passwordConstraints?: {
    minLength?: number;
    maxLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireDigits?: boolean;
    requireSymbols?: boolean;
    allowedSymbols?: string;
    excludeChars?: string;
  };
}

/** テンプレート変数を展開する */
function expandTemplate(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

/**
 * レシピエンジン — JSON定義に基づきPlaywrightのPageオブジェクトを操作する
 */
export class RecipeEngine {
  private recipes: Map<string, SiteRecipe> = new Map();

  /** レシピを登録する */
  addRecipe(recipe: SiteRecipe): void {
    this.recipes.set(recipe.site, recipe);
  }

  /** ドメイン名からレシピを検索する */
  findRecipe(domain: string): SiteRecipe | undefined {
    // 完全一致
    if (this.recipes.has(domain)) {
      return this.recipes.get(domain);
    }
    // www. 除去で再検索
    const bare = domain.replace(/^www\./, '');
    if (this.recipes.has(bare)) {
      return this.recipes.get(bare);
    }
    // 部分一致
    for (const [key, recipe] of this.recipes) {
      if (domain.endsWith(key) || key.endsWith(domain)) {
        return recipe;
      }
    }
    return undefined;
  }

  /** 登録済みレシピの一覧を返す */
  listRecipes(): SiteRecipe[] {
    return Array.from(this.recipes.values());
  }

  /** レシピがあるか確認する */
  hasRecipe(domain: string): boolean {
    return this.findRecipe(domain) !== undefined;
  }

  /**
   * AIが成功した操作手順をレシピとしてファイルに保存する（レシピ学習）
   */
  saveLearnedRecipe(
    domain: string,
    displayName: string,
    changePasswordUrl: string,
    steps: Array<{ action: string; selector?: string; value?: string; description?: string }>,
    recipesDir?: string
  ): SiteRecipe {
    // AI のステップをレシピアクション形式に変換
    const recipeSteps: RecipeAction[] = steps.map((s) => {
      if (s.action === 'fill' && s.selector && s.value) {
        return { action: 'fill' as const, selector: s.selector, value: s.value };
      } else if (s.action === 'click' && s.selector) {
        return { action: 'click' as const, selector: s.selector };
      }
      return { action: 'pause' as const, ms: 1000 };
    });

    const recipe: SiteRecipe = {
      site: domain,
      displayName: displayName || domain,
      requiresLogin: true,
      changePasswordUrl,
      steps: [
        { action: 'goto', url: changePasswordUrl },
        { action: 'pause', ms: 2000 },
        ...recipeSteps,
        { action: 'pause', ms: 3000 },
        { action: 'screenshot', name: `${domain}-password-changed` },
      ],
    };

    // メモリに登録
    this.addRecipe(recipe);

    // ファイルに保存
    const dir = recipesDir || join(process.cwd(), 'recipes');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const safeName = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = join(dir, `${safeName}.json`);
    writeFileSync(filePath, JSON.stringify(recipe, null, 2), 'utf-8');

    console.log(`📚 レシピを学習・保存しました: ${filePath}`);
    return recipe;
  }

  /**
   * レシピを実行する
   * @param page Playwright の Page オブジェクト
   * @param recipe 実行するレシピ
   * @param variables テンプレート変数 (old_password, new_password, username)
   */
  async executeRecipe(
    page: any, // Playwright Page型
    recipe: SiteRecipe,
    variables: Record<string, string>
  ): Promise<{ success: boolean; error?: string; screenshots: string[] }> {
    const screenshots: string[] = [];

    try {
      for (let i = 0; i < recipe.steps.length; i++) {
        const step = recipe.steps[i];
        console.log(`  [Step ${i + 1}/${recipe.steps.length}] ${step.action}`);

        switch (step.action) {
          case 'goto': {
            const url = expandTemplate(step.url, variables);
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            break;
          }
          case 'fill': {
            const value = expandTemplate(step.value, variables);
            await page.waitForSelector(step.selector, { timeout: 10000 });
            await page.fill(step.selector, value);
            break;
          }
          case 'click': {
            await page.waitForSelector(step.selector, { timeout: 10000 });
            await page.click(step.selector);
            break;
          }
          case 'waitForText': {
            await page.waitForFunction(
              (text: string) => document.body.innerText.includes(text),
              step.text,
              { timeout: step.timeout || 15000 }
            );
            break;
          }
          case 'waitForSelector': {
            await page.waitForSelector(step.selector, {
              timeout: step.timeout || 15000,
            });
            break;
          }
          case 'waitForNavigation': {
            await page.waitForLoadState('domcontentloaded', {
              timeout: step.timeout || 15000,
            });
            break;
          }
          case 'screenshot': {
            const name = step.name || `step-${i + 1}`;
            const path = `data/screenshots/${name.replace(/[^a-zA-Z0-9-]/g, '_')}-${Date.now()}.png`;
            await ensureScreenshotDir();
            await page.screenshot({ path, fullPage: false });
            screenshots.push(path);
            break;
          }
          case 'pause': {
            await new Promise((resolve) => setTimeout(resolve, step.ms));
            break;
          }
          case 'pressKey': {
            await page.keyboard.press(step.key);
            break;
          }
        }
      }

      return { success: true, screenshots };
    } catch (error: any) {
      // エラー時のスクリーンショット
      try {
        const errorPath = `data/screenshots/error-${Date.now()}.png`;
        await page.screenshot({ path: errorPath, fullPage: true });
        screenshots.push(errorPath);
      } catch {}

      return {
        success: false,
        error: error.message || String(error),
        screenshots,
      };
    }
  }
}
