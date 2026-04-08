import { config as dotenvConfig } from 'dotenv';
import { parsePasswordCSVFile, entriesToCSV } from './core/csv-parser.js';
import { Orchestrator } from './agent/orchestrator.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

dotenvConfig();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const question = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('');
  console.log('🔐 Password Auto-Change Agent (CLI)');
  console.log('====================================');
  console.log('');

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.log('使い方: npm run cli -- <CSVファイルパス>');
    console.log('');
    console.log('例: npm run cli -- passwords.csv');
    process.exit(1);
  }

  // CSV読み込み
  console.log(`📂 CSV読み込み: ${csvPath}`);
  const entries = parsePasswordCSVFile(csvPath);
  console.log(`   ${entries.length} 件のエントリを検出`);
  console.log('');

  // オーケストレーター初期化
  const orchestrator = new Orchestrator({
    hibpApiKey: process.env.HIBP_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    masterPassword: process.env.MASTER_PASSWORD,
    storePath: join(process.cwd(), 'data', 'store.encrypted'),
  });

  orchestrator.setEntries(entries);

  // イベントリスナー
  orchestrator.on((event) => {
    switch (event.type) {
      case 'breach-check-progress':
        process.stdout.write(
          `\r   チェック中... ${event.completed}/${event.total}`
        );
        break;
      case 'breach-check-complete':
        console.log(`\n   ⚠️  漏洩検出: ${event.compromisedCount} 件`);
        break;
      case 'password-change-start':
        console.log(`   🔄 変更中: ${event.domain}`);
        break;
      case 'password-change-complete':
        const icon = event.result.success ? '✅' : '❌';
        console.log(`   ${icon} ${event.result.domain}: ${event.result.success ? '成功' : event.result.error}`);
        break;
    }
  });

  // 漏洩チェック
  const doCheck = await question('🔍 漏洩チェックを実行しますか? (y/n): ');
  if (doCheck.toLowerCase() === 'y') {
    console.log('');
    console.log('🔍 漏洩チェック中...');
    await orchestrator.checkBreaches();
    console.log('');

    // 結果表示
    const compromised = entries.filter((e) => e.breachStatus === 'compromised');
    if (compromised.length > 0) {
      console.log('⚠️  漏洩が検出されたアカウント:');
      for (const entry of compromised) {
        console.log(`   - ${entry.name} (${entry.username}) — ${entry.breachCount?.toLocaleString()} 回漏洩`);
      }
      console.log('');
    } else {
      console.log('✅ 漏洩は検出されませんでした');
    }
  }

  // パスワード生成
  const doGenerate = await question('🎲 新しいパスワードを生成しますか? (y/n): ');
  if (doGenerate.toLowerCase() === 'y') {
    orchestrator.generateNewPasswords((e) => e.breachStatus === 'compromised');
    const withNew = entries.filter((e) => e.newPassword);
    console.log(`   ${withNew.length} 件の新しいパスワードを生成しました`);
    console.log('');
  }

  // パスワード変更
  const doChange = await question('🤖 パスワード変更を実行しますか? (y/n): ');
  if (doChange.toLowerCase() === 'y') {
    console.log('');
    console.log('🤖 パスワード変更を実行中...');
    const results = await orchestrator.executeBatchChange();
    console.log('');
    console.log(`   完了: ${results.filter((r) => r.success).length}/${results.length} 成功`);
    console.log('');
  }

  // エクスポート
  const doExport = await question('📤 更新済みCSVをエクスポートしますか? (y/n): ');
  if (doExport.toLowerCase() === 'y') {
    const csv = entriesToCSV(entries);
    const outputPath = join(process.cwd(), 'passwords-updated.csv');
    writeFileSync(outputPath, csv, 'utf-8');
    console.log(`   ✅ エクスポート完了: ${outputPath}`);
  }

  console.log('');
  console.log('👋 完了しました');
  rl.close();
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
