# Implementation Plan: 運用設計・セキュリティ強化に伴う実装の見直し

改定された README.md（高リスクデータ運用の手引き）のセキュリティ要件と運用設計に合わせ、現在の実装で不足・乖離している箇所を見直し・修正します。

## 目的

1. セキュリティリスク（誤公開や情報漏洩）を軽減する。
2. Google Password Manager 互換の CSV 入出力仕様を厳密に守る。
3. 公式 API が推奨する礼儀あるアクセス（User-Agent）を遵守する。

## 変更内容（Proposed Changes）

### 1. CSVエクスポート形式の厳格化

#### [MODIFY] src/core/csv-parser.ts
- `entriesToCSV` 関数を改修し、ヘッダおよびカラムを `url,username,password` のみに限定します。
- 理由: README および Google 公式ヘルプに準拠し、インポートエラーを防ぐとともに不要な情報をエクスポートしないため。

### 2. HIBP API への User-Agent 追加

#### [MODIFY] src/core/password-checker.ts
- `checkPasswordBreach` および `checkPasswordsBatch` 関数で `userAgent` を受け取れるようにし、API リクエストのヘッダに設定します。

#### [MODIFY] src/agent/orchestrator.ts (想定対象)
- Orchestrator のコンストラクタで `hibpUserAgent` を受け取り、`password-checker.ts` 側へ渡します。

#### [MODIFY] src/server.ts
- `process.env.HIBP_USER_AGENT` を読み込み、設定されていない場合はデフォルトの安全な User-Agent (`password-auto-change-agent/1.0`) を使いつつ、可能であれば警告を出します。

### 3. スクリーンショットのファイル名匿名化

#### [MODIFY] src/agent/browser-agent.ts
- 現在 `ai-result-${params.domain.replace(...)}-${Date.now()}.png` のようにドメイン名がそのままファイル名に含まれています。
- これを `ai-result-${Date.now()}-${ランダム文字列}.png` のような形式に変更し、保存されるファイル名から対象サイト（機密情報）を推測できないようにします。

### 4. サーバーのローカル運用警告

#### [MODIFY] src/server.ts
- サーバー起動時のログにおいて、`HOST` が `localhost` や `127.0.0.1` 以外で起動された場合、`[WARNING] ローカル環境以外での起動は非推奨です。機密情報を扱うため注意してください。` という強い警告ログを出力するようにします。

### 5. 設定ファイルおよび Git 除外ルールの強化

#### [MODIFY] .env.example
- `HOST` の項目に「外部公開しないこと」を警告するコメントを追加します。
- `HIBP_USER_AGENT` の追加例を記述します。

#### [MODIFY] .gitignore
- `playwright/.auth/` を追加します。
- `recipes/` を追加します（同梱の `src/recipes` とは別にローカルの学習結果保存先として）。

---

## User Review Required

上記の修正方針で実装を進めてよろしいでしょうか？  
特に「CSV エクスポート時に `name` や `note` などを削って `url,username,password` に限定する」点は仕様の変更になりますが、Google公式の仕様通りにするために必要となります。

## Verification Plan

### Automated Tests
- `npm test` を実行し、既存テスト（CSV のパース・エクスポート部分など）が通るか、または仕様変更に合わせたテスト修正を行います。

### Manual Verification
- `.env.example` の反映確認。
- 変更エクスポート時の CSV のヘッダと中身が正しいことの確認。
