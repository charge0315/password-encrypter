import express from 'express';
import multer from 'multer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { parsePasswordCSV, entriesToCSV, extractDomain, type PasswordEntry } from './core/csv-parser.js';
import { generatePassword, evaluatePasswordStrength } from './core/password-generator.js';
import { Orchestrator } from './agent/orchestrator.js';

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';

// データディレクトリ
const DATA_DIR = join(process.cwd(), 'data');
const SCREENSHOTS_DIR = join(DATA_DIR, 'screenshots');
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ミドルウェア
app.use(express.json());
app.use(express.static(join(__dirname, 'web')));
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// オーケストレーターのインスタンス（セッション管理は簡易実装）
let orchestrator: Orchestrator | null = null;

function getOrchestrator(): Orchestrator {
  if (!orchestrator) {
    orchestrator = new Orchestrator({
      hibpApiKey: process.env.HIBP_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      masterPassword: process.env.MASTER_PASSWORD,
      storePath: join(DATA_DIR, 'store.encrypted'),
    });
  }
  return orchestrator;
}

// === API Routes ===

/** CSV アップロード */
app.post('/api/upload-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'CSVファイルが必要です' });
      return;
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const entries = parsePasswordCSV(csvContent);

    const orch = getOrchestrator();
    orch.setEntries(entries);

    res.json({
      success: true,
      count: entries.length,
      entries: entries.map(sanitizeEntry),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** エントリ一覧取得 */
app.get('/api/entries', (_req, res) => {
  const orch = getOrchestrator();
  const entries = orch.getEntries();
  res.json({
    entries: entries.map(sanitizeEntry),
    total: entries.length,
    compromised: entries.filter((e) => e.breachStatus === 'compromised').length,
    safe: entries.filter((e) => e.breachStatus === 'safe').length,
    unchecked: entries.filter((e) => e.breachStatus === 'unchecked').length,
  });
});

/** 漏洩チェック実行 */
app.post('/api/check-breaches', async (_req, res) => {
  try {
    const orch = getOrchestrator();
    await orch.checkBreaches();
    const entries = orch.getEntries();

    res.json({
      success: true,
      entries: entries.map(sanitizeEntry),
      compromised: entries.filter((e) => e.breachStatus === 'compromised').length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** パスワード一括生成 */
app.post('/api/generate-passwords', (req, res) => {
  try {
    const orch = getOrchestrator();
    const { filter, options } = req.body || {};

    let filterFn: ((entry: PasswordEntry) => boolean) | undefined;
    if (filter === 'compromised') {
      filterFn = (e) => e.breachStatus === 'compromised';
    } else if (filter === 'all') {
      filterFn = undefined;
    }

    orch.generateNewPasswords(filterFn, options);

    res.json({
      success: true,
      entries: orch.getEntries().map(sanitizeEntry),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 個別パスワード生成 */
app.post('/api/generate-password', (req, res) => {
  try {
    const { options, entryId } = req.body || {};
    const password = generatePassword(options);
    const strength = evaluatePasswordStrength(password);

    if (entryId) {
      const orch = getOrchestrator();
      const entry = orch.getEntries().find((e) => e.id === entryId);
      if (!entry) {
        res.status(404).json({ error: '対象エントリが見つかりませんでした' });
        return;
      }
      entry.newPassword = password;
    }

    res.json({ password, strength, entryId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** パスワード変更実行（一括） */
app.post('/api/execute-changes', async (req, res) => {
  try {
    const orch = getOrchestrator();
    const { entryIds } = req.body || {};

    const results = await orch.executeBatchChange(entryIds);

    res.json({
      success: true,
      results,
      entries: orch.getEntries().map(sanitizeEntry),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** CSV エクスポート */
app.get('/api/export-csv', (_req, res) => {
  try {
    const orch = getOrchestrator();
    const csv = entriesToCSV(orch.getEntries());

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="passwords-updated.csv"');
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** パスワード強度チェック */
app.post('/api/check-strength', (req, res) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: 'パスワードが必要です' });
    return;
  }
  res.json(evaluatePasswordStrength(password));
});

/** レシピ一覧 */
app.get('/api/recipes', (_req, res) => {
  const orch = getOrchestrator();
  const recipes = orch.getRecipeEngine().listRecipes();
  res.json({
    recipes: recipes.map((r) => ({
      site: r.site,
      displayName: r.displayName,
      stepsCount: r.steps.length,
    })),
  });
});

/** 変更結果一覧 */
app.get('/api/results', (_req, res) => {
  const orch = getOrchestrator();
  res.json({ results: orch.getResults() });
});

// エントリのセキュリティ情報を除去（パスワード自体はマスクする）
function sanitizeEntry(entry: PasswordEntry) {
  const orch = getOrchestrator();
  const domain = extractDomain(entry.url);
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    domain,
    username: entry.username,
    passwordMasked: '•'.repeat(Math.min(entry.password.length, 16)),
    passwordLength: entry.password.length,
    breachStatus: entry.breachStatus,
    breachCount: entry.breachCount,
    hasNewPassword: !!entry.newPassword,
    newPasswordMasked: entry.newPassword
      ? '•'.repeat(Math.min(entry.newPassword.length, 16))
      : undefined,
    changeStatus: entry.changeStatus,
    errorMessage: entry.errorMessage,
    hasRecipe: orch.getRecipeEngine().hasRecipe(domain),
  };
}

// サーバー起動
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🔐 Password Auto-Change Agent');
  console.log(`   http://${HOST}:${PORT}`);
  console.log('');
  console.log('📋 使い方:');
  console.log('   1. Google Password Manager から CSV をエクスポート');
  console.log('   2. ブラウザで上記URLを開く');
  console.log('   3. CSV をアップロードして漏洩チェック');
  console.log('');
});
