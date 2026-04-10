# Password Auto-Change Agent

Google Password Manager からエクスポートした CSV を読み込み、漏洩チェック、新規パスワード生成、ブラウザ操作によるパスワード変更支援を行うツールです。CLI と Web UI の両方を提供します。

> **重要**  
> 本ツールは「人が確認しながら進める半自動化ツール」です。  
> CAPTCHA、2FA、再認証、利用規約、UI 変更、Bot 判定などにより、完全自動化は前提としていません。  
> **安全性と確実性を優先し、必要に応じて手動介入する設計**です。

---

## このツールが解決すること

- Google Password Manager の CSV を読み込み、対象アカウントを一元管理する
- 漏洩パスワードの有無を確認する
- 強力な新規パスワードを生成する
- Playwright によりパスワード変更ページへの遷移・操作を支援する
- サイトごとに変更結果を追跡し、最終的に **Chrome / Google Password Manager に再インポート可能な CSV** を出力する

---

## セキュリティ上の前提

このツールは**認証情報そのもの**を扱います。通常の Web アプリや CLI よりも取り扱いリスクが高いため、以下を必ず理解したうえで利用してください。

- **ローカル環境専用**で使用してください
- 実パスワードを含む CSV を扱うため、**共有 PC / 共用サーバー / リモート公開環境では使用しない**でください
- Web UI は簡易ローカル運用を想定しています。**インターネットへ公開しないでください**
- Playwright のスクリーンショット、保存 state、ログ、デバッグ出力には**機密情報が含まれる可能性**があります
- AI 解析を有効にした場合、対象ページの HTML や UI 情報が外部 API に送信される可能性があります。**機密性の高いサイトでは無効化を推奨**します
- 本ツールはパスワードを安全に生成・管理する補助を行いますが、**各サービスのアカウント保護責任そのものを代替するものではありません**

---

## 脅威モデルと非目標

### 守りたいもの

- 元のパスワード CSV
- 新規生成したパスワード
- セッション情報（Cookie、認証ヘッダ、ブラウザ state）
- 実行結果に含まれるステータスやメモ
- スクリーンショットやログに写り込んだ機密情報

### 想定する主なリスク

- 平文 CSV の漏えい
- ローカル保存ファイルの誤同期（Git、クラウドバックアップ、共有フォルダ）
- ログやスクリーンショットへの秘密情報混入
- 外部 AI 解析による情報送信
- Web UI の誤公開
- サイト側 UI 変更による誤操作
- 短時間の連続失敗や自動化挙動によるアカウント BAN・ロック

### 非目標

- CAPTCHA / 2FA / 再認証の完全回避
- 全サイトでの完全自動変更保証
- 公開サーバー上での多人数運用
- サイト規約や Bot 対策を迂回すること
- アカウントロック保護を突破してのパスワード変更試行

---

## 機能

- Google Password Manager 形式の CSV を読み込み、`PasswordEntry` に変換
- Have I Been Pwned Pwned Passwords API の **k-anonymity** 方式で漏洩チェック
- 暗号学的に安全なランダムパスワードの生成と強度評価
- Playwright によるパスワード変更操作の支援
- サイト別レシピがない場合は Gemini API を使って HTML を解析
- 更新済み CSV の再エクスポート
- `MASTER_PASSWORD` を設定した場合のみ、結果を暗号化して保存

---

## 前提と注意点

- 実パスワードを含む CSV を扱うため、**ローカル環境での利用を前提**にしてください
- CAPTCHA、2FA、再認証、UI 変更などにより、自動変更は途中で**人の介入が必要**になることがあります
- Web API はパスワードをマスクして返しますが、**サーバープロセス内では平文パスワードを扱います**
- `GEMINI_API_KEY` が未設定で、かつ対応レシピがないサイトでは対象ページを開いて手動対応へ切り替えます。手動作業後にタブを閉じると処理が続行します
- ユニットテストは Node.js 標準テストランナーで実行します。`npm test` は事前に `npm run build` を実行してからテストを走らせます
- **本ツールを使って生成した CSV は機密ファイルです。インポート後は速やかに削除してください**

---

## 対応 CSV 形式

本ツールの入出力は **Chrome / Google Password Manager 互換** を前提にしています。

### 入力形式

Google Password Manager からエクスポートした CSV を想定します。

### 出力形式

再インポート用 CSV のヘッダは次の形式にしてください。

```csv
url,username,password
```

Google の公式ヘルプでも、パスワードのインポート用 CSV は `.csv` 形式であり、先頭行に `url,username,password` を含める必要があると案内されています。また、インポート後は CSV を削除することが推奨されています。[Source](https://support.google.com/accounts/answer/10500247?hl=en)

### 運用上の注意

- 1 回にインポートできる件数には上限があります
- 大量件数を扱う場合は分割運用を推奨します
- インポート用 CSV は**最終成果物であると同時に、最も危険な平文秘密情報ファイル**です

---

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
| `HOST` | 任意 | Web サーバーのホスト。**デフォルトは `localhost` を推奨** |
| `MASTER_PASSWORD` | 任意 | `data/store.encrypted` を保護するマスターパスワード。未設定なら暗号化保存は無効 |
| `GEMINI_API_KEY` | 任意 | レシピがないサイトを Gemini で解析するための API キー |
| `HIBP_API_KEY` | 任意 | HIBP API キー。**Pwned Passwords の range 検索自体には必須ではない** |
| `HIBP_USER_AGENT` | 推奨 | HIBP へ送る User-Agent。アプリ名と連絡先を含めることを推奨 |
| `DATA_DIR` | 任意 | 実行データ保存先。既定は `./data` |
| `LOG_LEVEL` | 任意 | `info` / `warn` / `error` / `debug`。本番運用では `debug` 非推奨 |

例:

```env
PORT=3000
HOST=localhost
MASTER_PASSWORD=replace-with-a-strong-passphrase
GEMINI_API_KEY=your_gemini_api_key
HIBP_API_KEY=your_hibp_api_key
HIBP_USER_AGENT=password-auto-change-agent/1.0 (admin@example.com)
DATA_DIR=./data
LOG_LEVEL=info
```

### 3. Playwright ブラウザが不足している場合

Chromium の起動に失敗する場合は、必要に応じて次を実行してください。

```bash
npx playwright install
```

---

## 安全に使うための推奨事項

### 必須に近い推奨

- `.env`、`data/`、`recipes/`、スクリーンショット保存先、Playwright の state 保存先を **`.gitignore` に追加**
- 実行は**専用ユーザー**または**専用ローカル端末**で行う
- フルディスク暗号化された端末で使う
- 作業中は画面共有や録画を切る
- 生成済み CSV はインポート後に削除する
- Web UI 利用時は `HOST=localhost` のままにする
- OS バックアップ、クラウド同期、共有フォルダへの自動同期対象から除外する

### できれば実施したい推奨

- `data/` の権限を最小化する
- ログの保存期間を短くする
- スクリーンショットを既定で無効化、または保存前にマスクする
- サイトごとに処理前後の確認ステップを入れる
- 大量変更前に **dry-run** で対象判定だけ確認する
- 途中中断・再開時に**どこまで完了したか**を安全に追跡できるようにする

---

## HIBP 漏洩チェックについて

本ツールは Have I Been Pwned の **Pwned Passwords API** を使い、**k-anonymity** 方式で漏洩チェックを行います。

概要:

1. パスワードをローカルで SHA-1 または NTLM にハッシュ化
2. 先頭 5 文字だけを API に送信
3. API は一致する prefix を持つ suffix 群と件数を返す
4. 残りの照合はローカルで実施

この方式により、**元のパスワード文字列そのものを送らずに照会**できます。[Source](https://haveibeenpwned.com/api/v3)

補足:

- Pwned Passwords の range 検索は **API キー不要**です [Source](https://haveibeenpwned.com/api/v3)
- HIBP API へのリクエストでは **User-Agent の設定が推奨**されます。User-Agent が欠けると 403 になるエンドポイントがあります [Source](https://haveibeenpwned.com/api/v3)
- Pwned Passwords API 自体には明示的なレート制限はありませんが、**礼儀あるアクセス頻度**を維持してください [Source](https://haveibeenpwned.com/api/v3)

---

## AI 解析の取り扱い

レシピが存在しない場合、`GEMINI_API_KEY` が設定されていれば Gemini API を使って HTML を解析し、変更操作を補助できます。

ただし、以下を理解したうえで **明示的に opt-in** してください。

- 外部 API へページ内容が送信される可能性があります
- HTML や DOM 中に、ユーザー名、プロフィール情報、設定項目名などが含まれる場合があります
- 高機密サイト（金融、医療、社内システム、行政、本人確認系）では **無効化推奨** です
- 可能であれば、AI 解析前にフォーム値や機密領域をマスクする実装を推奨します

推奨方針:

- 既知サイトは**レシピ優先**
- AI 解析は**最終手段**
- 失敗時は**手動切り替え**
- AI 学習結果の再利用時も、人間によるレビューを通す

---

## Playwright の取り扱い

本ツールは Playwright によってブラウザを起動し、パスワード変更ページの操作を支援します。

### セキュリティ上の重要点

Playwright の認証 state ファイルには、**Cookie やヘッダなど、なりすましに使える情報**が含まれる可能性があります。Playwright 公式も、これらのファイルを private/public を問わずリポジトリにコミットしないよう強く推奨しています。[Source](https://playwright.dev/docs/auth)

そのため、次を推奨します。

- `playwright/.auth` のような専用ディレクトリを作る
- そのディレクトリを `.gitignore` に追加する
- 作業終了後は state を破棄する
- 共通 state を複数セッションで使い回しすぎない
- 可能ならサイトごと・実行単位ごとに分離する

### 実装・運用の推奨

- `headless: false` で起動し、人間の確認を前提にする
- 手動介入（マニュアルモード）時は、ターミナルや画面上に「何をすべきか」「どうすれば再開されるか」を迷わずわかるように出力する
- 自動入力後の送信前に確認ステップを設ける
- パスワード複数回送信によるアカウントBANを避けるため、リトライ処理は最小限にとどめる
- 失敗時はスクリーンショットよりも **DOM スナップショットや構造化ログ** を優先し、秘密情報混入を抑える
- スクリーンショット保存時は、フォーム領域のマスクを検討する

---

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
5. 対象アカウントを選択して変更支援を実行
6. 必要に応じて手動対応
7. 更新済み CSV をエクスポート
8. Chrome / Google Password Manager に再インポート
9. **CSV を削除**

### CLI

```bash
npm run cli -- "./Google Passwords.csv"
```

CLI では対話形式で次を順に確認しながら進めます。

1. CSV 読み込み
2. 漏洩チェックの実行
3. 新パスワードの生成
4. パスワード変更の実行または手動対応
5. 更新済み CSV のエクスポート

エクスポート先は `passwords-updated.csv` です。

---

## 推奨運用フロー

1. 元の CSV を安全なローカルディレクトリへ配置
2. ツールで漏洩チェック
3. 対象を絞って新規パスワード生成
4. まずは少数件で dry-run 的に挙動確認
5. 問題なければ本処理
6. 手動介入が必要なサイトだけ個別対応
7. 更新済み CSV を出力
8. Chrome / Google Password Manager にインポート
9. 元 CSV、更新後 CSV、不要な state、スクリーンショットを削除または安全保管

---

## API

`src/server.ts` では次の API を提供しています。

| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/api/upload-csv` | CSV ファイルを受け取り、エントリを登録 |
| `GET` | `/api/entries` | 現在のエントリ一覧と集計を返す |
| `POST` | `/api/check-breaches` | 全エントリの漏洩チェックを実行 |
| `POST` | `/api/generate-passwords` | 一括で新しいパスワードを生成 |
| `POST` | `/api/generate-password` | 単一エントリ向けに新しいパスワードを生成して保持 |
| `POST` | `/api/execute-changes` | 指定エントリのパスワード変更を実行 |
| `POST` | `/api/manual-complete` | 手動で変更したエントリを変更済みとして反映 |
| `GET` | `/api/export-csv` | 更新済み CSV をダウンロード |
| `POST` | `/api/check-strength` | パスワード強度を評価 |
| `GET` | `/api/recipes` | 読み込み済みレシピ一覧を返す |
| `GET` | `/api/results` | 変更結果一覧を返す |

### API の注意

- `/api/entries` や `/api/generate-password` などのレスポンスでは、実パスワードの代わりにマスク済みの値を返します
- Web UI は単一の `Orchestrator` インスタンスを共有する簡易構成です
- **この構成は単一ユーザー・単一端末向け**です。多人数同時利用や共有サーバー運用には向きません
- 手動対応に切り替わったエントリは、Web UI の `完了` ボタンで `変更済み` に反映できます

### 公開運用しないこと

認証・認可・CSRF 対策なしに Web API をネットワーク公開するのは危険です。  
ローカル開発を超えて利用する場合は、少なくとも以下が必要です。

- 認証
- HTTPS/TLS
- CSRF 対策
- セッション分離
- 利用者ごとのジョブ分離
- ログ監査
- シークレット管理
- レート制限
- ファイルアップロード制限

本リポジトリは**そこまでを標準実装の対象にしていません**。

---

## レシピの扱い

パスワード変更の自動操作には JSON レシピを使います。

- 既定では `recipes/` があればそちらを優先して読み込みます
- `recipes/` がない場合は、同梱サンプルの `src/recipes/` を読み込みます
- AI で学習したレシピはルートの `recipes/` に保存されます
- スキーマは `src/recipes/schema.json` にあります

レシピが見つからない場合の挙動:

- `GEMINI_API_KEY` がある場合は Gemini でページを解析して操作を試みます
- API キーがない場合はページを開いたまま待機し、手動対応後にタブを閉じると次の処理へ進みます

### レシピ運用の推奨

- レシピは Git 管理してもよいが、**実データ・実アカウント固有値を含めない**
- セレクタは壊れやすいため、定期的に見直す
- サイト別レシピはレビューを通してから共有する
- AI 生成レシピを即本番投入しない

---

## 暗号化保存

`MASTER_PASSWORD` を設定した場合のみ、結果を暗号化して保存できます。

### 推奨事項

- 暗号化保存を使う場合でも、**元の CSV 自体が平文である問題は解決しません**
- `MASTER_PASSWORD` は十分に長いパスフレーズを使ってください
- `.env` やシェル履歴、プロセス一覧への露出に注意してください
- 暗号化対象・非対象を README とコードで一致させてください
- 復号失敗時の挙動、鍵変更時の移行手順、バックアップ方針を明文化するとさらに良いです

---

## ログとスクリーンショット

### 原則

- パスワードをログに出力しない
- 入力前・入力後ともにスクリーンショットへ秘密情報を残さない
- デバッグログは既定で最小限にする
- 例外ログへ request/response 全文を出さない

### 推奨改善

- ログの redaction 層を設ける
- `password`, `secret`, `token`, `cookie`, `authorization` などを一律マスクする
- 失敗解析用にはスクリーンショットよりも構造化イベントログを優先する
- 保存ファイル名に URL や username をそのまま含めない

---

## ディレクトリ構成

```text
password-encrypter/
├─ data/                  # 実行時データ、暗号化ストア、スクリーンショット等（機密）
├─ recipes/               # 任意: 追加/学習済みレシピ保存先
├─ playwright/.auth/      # 任意: 認証 state 保存先（機密・要 .gitignore）
├─ src/
│  ├─ agent/              # Orchestrator、BrowserAgent、RecipeEngine、AI解析
│  ├─ core/               # CSV、漏洩チェック、パスワード生成、暗号化ストア
│  ├─ recipes/            # 同梱サンプルレシピ
│  ├─ web/                # Web UI
│  ├─ index.ts            # CLI エントリーポイント
│  └─ server.ts           # Express サーバー
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

---

## .gitignore 推奨例

```gitignore
node_modules/
dist/

.env
data/
recipes/
playwright/.auth/
*.csv
*.log
```

> `*.csv` を一律 ignore にするとサンプル CSV まで除外されるため、必要に応じて運用へ合わせて調整してください。

---

## 開発メモ

よく使うコマンド:

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | Web サーバーを起動 |
| `npm run cli -- <csv>` | CLI を起動 |
| `npm run build` | TypeScript をビルド |
| `npm run test` | ビルド後にユニットテストを実行 |
| `npm run test:watch` | ビルド後にユニットテストを watch モードで実行 |

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

---

## テストと検証の観点

最低限、以下は自動テスト化を推奨します。

### 単体テスト

- CSV パースと再出力の整合性
- `url,username,password` ヘッダ出力
- パスワード生成ポリシー
- HIBP 照合ロジック
- 暗号化・復号
- レシピ読み込みとスキーマ検証
- ログ redaction

### 結合テスト

- CSV 読み込み → 生成 → 再出力までの一連フロー
- 手動介入を含む中断・再開
- 失敗時のロールバック／再試行
- スクリーンショットやログに秘密情報が残らないこと

### 実運用前チェック

- 少数アカウントで dry-run
- テスト用アカウントで変更フロー確認
- Chrome / Google Password Manager への再インポート確認
- 作業後の CSV / state / ログ削除確認

---

## 制約

- ブラウザ操作は `headless: false` で起動するため、ローカル GUI 環境が前提です
- 漏洩チェックは逐次実行で、既定ではリクエスト間に待機を入れる想定です
- レシピや AI 解析結果は、対象サイトの UI 変更により壊れる可能性があります
- 全サイトの変更フォームに安定対応することはできません
- 一部サービスではパスワード履歴制約、デバイス認証、2FA、メール確認が必須になるため、完全自動変更はできません

---

## 既知の改善余地

- dry-run モードの標準実装
- 秘密情報を自動マスクするスクリーンショット機構
- レシピの信頼度スコア
- サイト別ワークフローの中断・再開性向上
- Web UI のジョブ分離
- ローカル専用認証の追加
- 秘密情報の OS キーチェーン連携
- AI 解析前の DOM サニタイズ

---

## 免責

本ツールは、ユーザー自身が保有・管理するアカウントのパスワード変更作業を支援するためのものです。  
各サイトの利用規約、セキュリティポリシー、組織ルールを遵守して使用してください。  
本ツールの利用により生じたアカウントロック、操作失敗、データ損失その他の不利益について、利用者自身が十分に検証し、責任を持って運用してください。
