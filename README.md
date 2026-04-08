# Password Auto-Change Agent

Google Password Manager からエクスポートした CSV を読み込み、漏洩チェック、新規パスワード生成、ブラウザ操作による変更支援を行うツールです。CLI と Web UI の両方を用意しており、完全自動化ではなく「人が確認しながら進める」前提で設計されています。

## 機能

- Google Password Manager 形式の CSV を読み込み、`PasswordEntry` に変換
- Have I Been Pwned Passwords API の k-anonymity 方式で漏洩チェック
- 暗号学的に安全なランダムパスワードの生成と強度評価
- Playwright によるパスワード変更操作の支援
- サイト別レシピがない場合は Gemini API を使って HTML を解析
- 更新済み CSV の再エクスポート
- `MASTER_PASSWORD` を設定した場合のみ、結果を暗号化して保存

## 前提と注意点

- 実パスワードを含む CSV を扱うため、ローカル環境での利用を前提にしてください。
- CAPTCHA、2FA、再認証、UI変更などにより、自動変更は途中で人の介入が必要になることがあります。
- Web API はパスワードをマスクして返しますが、サーバープロセス内では平文のパスワードを扱います。
- `GEMINI_API_KEY` が未設定で、かつ対応レシピがないサイトでは自動変更できず、手動対応前提になります。
- Vitest の設定はありますが、現時点ではテストファイルは同梱されていません。`npm test` はテスト未検出で終了します。

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 環境変数を設定

`.env.example` を参考に `.env` を作成し、必要な値を設定してください。

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `PORT` | 任意 | Web サーバーのポート。デフォルトは `3000` |
| `HOST` | 任意 | Web サーバーのホスト。デフォルトは `localhost` |
| `MASTER_PASSWORD` | 任意 | `data/store.encrypted` を保護するマスターパスワード。未設定なら暗号化保存は無効 |
| `GEMINI_API_KEY` | 任意 | レシピがないサイトを Gemini で解析するための API キー |
| `HIBP_API_KEY` | 任意 | HIBP API キー。未設定でも漏洩チェック自体は可能 |

例:

```env
PORT=3000
HOST=localhost
MASTER_PASSWORD=your_master_password
GEMINI_API_KEY=your_gemini_api_key
HIBP_API_KEY=your_hibp_api_key
```

### 3. Playwright ブラウザが不足している場合

Chromium の起動に失敗する場合は、必要に応じて次を実行してください。

```bash
npx playwright install
```

## 使い方

### Web UI

```bash
npm run dev
```

起動後、`http://localhost:3000` を開きます。

基本フロー:

1. Google Password Manager から CSV をエクスポート
2. Web UI に CSV をアップロード
3. 漏洩チェックを実行
4. 新しいパスワードを生成
5. 対象アカウントを選択して一括変更を実行
6. 更新済み CSV をエクスポート

### CLI

```bash
npm run cli -- "./Google Passwords.csv"
```

CLI では対話形式で次を順に確認しながら進めます。

1. CSV 読み込み
2. 漏洩チェックの実行
3. 新パスワードの生成
4. パスワード変更の実行
5. 更新済み CSV のエクスポート

エクスポート先は `passwords-updated.csv` です。

## API

`src/server.ts` では次の API を提供しています。

| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/api/upload-csv` | CSV ファイルを受け取り、エントリを登録 |
| `GET` | `/api/entries` | 現在のエントリ一覧と集計を返す |
| `POST` | `/api/check-breaches` | 全エントリの漏洩チェックを実行 |
| `POST` | `/api/generate-passwords` | 一括で新しいパスワードを生成 |
| `POST` | `/api/generate-password` | 単一エントリ向けにパスワードを生成 |
| `POST` | `/api/execute-changes` | 指定エントリのパスワード変更を実行 |
| `GET` | `/api/export-csv` | 更新済み CSV をダウンロード |
| `POST` | `/api/check-strength` | パスワード強度を評価 |
| `GET` | `/api/recipes` | 読み込み済みレシピ一覧を返す |
| `GET` | `/api/results` | 変更結果一覧を返す |

補足:

- `/api/entries` などのレスポンスでは、実パスワードの代わりにマスク済みの値を返します。
- Web UI は単一の `Orchestrator` インスタンスを共有する簡易構成です。

## レシピの扱い

パスワード変更の自動操作には JSON レシピを使います。

- 既定では `recipes/` があればそちらを優先して読み込みます
- `recipes/` がない場合は、同梱サンプルの `src/recipes/` を読み込みます
- AI で学習したレシピはルートの `recipes/` に保存されます
- スキーマは `src/recipes/schema.json` にあります

レシピが見つからない場合の挙動:

- `GEMINI_API_KEY` がある場合は Gemini でページを解析して操作を試みます
- API キーがない場合はページを開いた上で手動対応が必要になります

## ディレクトリ構成

```text
password-encrypter/
├─ data/                  # 実行時データ、暗号化ストア、スクリーンショット
├─ recipes/               # 任意: 追加/学習済みレシピ保存先
├─ src/
│  ├─ agent/              # Orchestrator、BrowserAgent、RecipeEngine、AI解析
│  ├─ core/               # CSV、漏洩チェック、パスワード生成、暗号化ストア
│  ├─ recipes/            # 同梱サンプルレシピ
│  ├─ web/                # Web UI
│  ├─ index.ts            # CLI エントリーポイント
│  └─ server.ts           # Express サーバー
├─ .env.example
├─ package.json
└─ README.md
```

## 開発メモ

よく使うコマンド:

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | Web サーバーを起動 |
| `npm run cli -- <csv>` | CLI を起動 |
| `npm run build` | TypeScript をビルド |
| `npm run test` | Vitest を実行 |
| `npm run test:watch` | Vitest を監視モードで実行 |

主要ファイル:

- `src/index.ts`: CLI フロー
- `src/server.ts`: Express API と静的 Web UI 配信
- `src/agent/orchestrator.ts`: 状態管理と処理の流れ
- `src/agent/browser-agent.ts`: Playwright ベースの自動操作
- `src/agent/recipe-engine.ts`: レシピの検索、実行、保存
- `src/core/csv-parser.ts`: CSV 読み込みと書き出し
- `src/core/password-checker.ts`: HIBP を使った漏洩チェック
- `src/core/password-generator.ts`: パスワード生成と強度評価
- `src/core/crypto-store.ts`: AES-256-GCM による暗号化保存

## 制約

- ブラウザ操作は `headless: false` で起動するため、ローカル GUI 環境が前提です。
- 漏洩チェックは逐次実行で、既定ではリクエスト間に 200ms の待機を入れています。
- レシピや AI 解析結果は、対象サイトの UI 変更によりすぐ壊れる可能性があります。
