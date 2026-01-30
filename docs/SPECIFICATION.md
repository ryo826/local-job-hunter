# Local Job Hunter - 仕様書

**バージョン**: 1.0.0
**最終更新**: 2026-01-30

---

## 1. 概要

Local Job Hunterは、日本の主要求人サイトから求人情報を自動収集し、B2B営業のリード管理を行うデスクトップアプリケーションです。

### 主な目的
- 求人サイトから企業情報を自動スクレイピング
- 営業パイプライン管理（ステータス追跡）
- Google Maps APIによる電話番号エンリッチメント
- NGキーワードによる自動フィルタリング

---

## 2. 技術スタック

### フロントエンド
| 技術 | バージョン | 用途 |
|------|-----------|------|
| React | 19.2.0 | UIフレームワーク |
| TypeScript | 5.9.3 | 型安全性 |
| Vite | 7.2.4 | ビルドツール |
| TailwindCSS | 4.1.18 | スタイリング |
| Zustand | 5.0.10 | 状態管理 |
| React Router | 7.13.0 | ルーティング |
| TanStack Query | 5.90.20 | サーバー状態管理 |
| Radix UI | 1.1.15 | UIコンポーネント |
| Lucide React | 0.563.0 | アイコン |

### バックエンド（Electron）
| 技術 | バージョン | 用途 |
|------|-----------|------|
| Electron | 40.0.0 | デスクトップアプリ |
| Better-sqlite3 | 12.6.2 | SQLiteデータベース |
| Playwright | 1.58.0 | Webスクレイピング |
| Axios | 1.13.4 | HTTPクライアント |

---

## 3. プロジェクト構成

```
local-job-hunter/
├── src/                          # React フロントエンド
│   ├── components/               # UIコンポーネント
│   │   ├── ui/                  # 共通UIコンポーネント
│   │   ├── CompanyGrid.tsx      # 企業カード表示
│   │   ├── ScrapingPanel.tsx    # スクレイピング進捗パネル
│   │   └── Sidebar.tsx          # サイドバーナビゲーション
│   ├── pages/                   # ページコンポーネント
│   │   ├── DashboardPage.tsx    # ダッシュボード
│   │   ├── ListPage.tsx         # 企業一覧
│   │   ├── SearchPage.tsx       # スクレイピング実行
│   │   └── SettingsPage.tsx     # 設定（NGキーワード）
│   ├── stores/                  # Zustand ストア
│   │   └── appStore.ts          # アプリ状態管理
│   ├── config/settings.ts       # 設定定数
│   └── shared/types/            # 型定義
│
├── electron/                     # Electron メインプロセス
│   ├── main.ts                  # エントリーポイント & IPCハンドラ
│   ├── preload.ts               # レンダラーへのAPI橋渡し
│   ├── scraping-engine.ts       # スクレイピングエンジン
│   ├── database.ts              # データベース接続
│   ├── database/migrations/     # DBマイグレーション
│   ├── repositories/            # データアクセス層
│   ├── services/                # ビジネスロジック
│   │   ├── DataConverter.ts     # データ変換
│   │   ├── UpsertService.ts     # 更新/挿入処理
│   │   └── GoogleMapsService.ts # Google Maps API連携
│   └── strategies/              # スクレイピング実装
│       ├── ScrapingStrategy.ts  # インターフェース
│       ├── mynavi.ts            # マイナビ転職
│       ├── doda.ts              # doda
│       └── rikunabi.ts          # リクナビNEXT
│
└── docs/                        # ドキュメント
```

---

## 4. データベース設計

### 4.1 jobs テーブル（求人情報）

| カラム | 型 | 説明 |
|--------|------|------|
| id | TEXT PK | source_source_job_id形式 |
| source | TEXT | 求人サイト（mynavi/rikunabi/doda） |
| source_job_id | TEXT | 元サイトのジョブID |
| source_url | TEXT | 元サイトURL |
| company_name | TEXT | 会社名 |
| company_url | TEXT | 会社ページURL |
| title | TEXT | 求人タイトル |
| employment_type | TEXT | 雇用形態 |
| industry | TEXT | 業種 |
| salary_min | INTEGER | 最低年収 |
| salary_max | INTEGER | 最高年収 |
| salary_text | TEXT | 給与テキスト |
| locations | TEXT | 勤務地（JSON配列） |
| location_summary | TEXT | 勤務地サマリー |
| labels | TEXT | ラベル（JSON配列） |
| keywords | TEXT | キーワード（JSON配列） |
| ng_keyword_matches | TEXT | マッチしたNGキーワード（JSON配列） |
| scraped_at | TEXT | スクレイピング日時 |
| is_active | INTEGER | 有効フラグ |

### 4.2 companies テーブル（B2B営業用）

| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER PK | 自動採番 |
| company_name | TEXT | 会社名 |
| source | TEXT | ソースサイト |
| url | TEXT UNIQUE | 求人URL |
| homepage_url | TEXT | 企業HP |
| status | TEXT | ステータス（デフォルト: 'new'） |
| scrape_status | TEXT | スクレイピング状態 |
| industry | TEXT | 業種 |
| area | TEXT | エリア（都道府県） |
| job_title | TEXT | 職種 |
| salary_text | TEXT | 給与 |
| representative | TEXT | 代表者 |
| establishment | TEXT | 設立 |
| employees | TEXT | 従業員数 |
| revenue | TEXT | 売上高 |
| phone | TEXT | 電話番号 |
| email | TEXT | メールアドレス |
| address | TEXT | 住所 |
| note | TEXT | メモ |
| ai_summary | TEXT | AI要約 |
| ai_tags | TEXT | AIタグ |
| created_at | TEXT | 作成日時 |
| updated_at | TEXT | 更新日時 |

### 4.3 scraping_logs テーブル（実行ログ）

| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER PK | 自動採番 |
| scrape_type | TEXT | タイプ（search/detail/full） |
| source | TEXT | ソースサイト |
| status | TEXT | 状態（success/error/partial） |
| jobs_found | INTEGER | 発見求人数 |
| new_jobs | INTEGER | 新規求人数 |
| updated_jobs | INTEGER | 更新求人数 |
| errors | INTEGER | エラー数 |
| duration_ms | INTEGER | 実行時間（ミリ秒） |
| scraped_at | TEXT | 実行日時 |

### 4.4 ng_keywords テーブル（ブラックリスト）

| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER PK | 自動採番 |
| keyword | TEXT UNIQUE | NGキーワード |
| category | TEXT | カテゴリ（company/title/description） |
| is_regex | INTEGER | 正規表現フラグ |
| created_at | TEXT | 作成日時 |

---

## 5. 機能詳細

### 5.1 スクレイピング機能

#### 対応サイト

| サイト | ベースURL | 状態 |
|--------|----------|------|
| マイナビ転職 | `https://tenshoku.mynavi.jp/list/` | ✅ 動作確認済み |
| doda | `https://doda.jp/DodaFront/View/JobSearchList.action` | ✅ 動作確認済み |
| リクナビNEXT | `https://next.rikunabi.com/job_search/` | 🔧 調整中 |

#### スクレイピングフロー

```
1. サイト選択 & キーワード入力
2. 検索結果ページへ移動
3. 求人カードを検出
4. 各カードから情報抽出
   - 会社名
   - 求人タイトル
   - 給与
   - 勤務地
   - 詳細URL
5. 詳細ページへ移動（必要に応じて）
6. 企業情報を抽出
   - 代表者
   - 設立
   - 従業員数
   - 事業内容
   - 電話番号
   - 住所
7. データベースに保存
8. 次ページへ移動（ページネーション）
9. 重複50件連続で自動停止（スマートストップ）
```

#### ボット検出回避

```typescript
// Chromium起動オプション
{
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials'
  ]
}

// ブラウザコンテキスト
{
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  viewport: { width: 1920, height: 1080 },
  bypassCSP: true,
  javaScriptEnabled: true,
  ignoreHTTPSErrors: true
}

// webdriverフラグ削除
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  (window as any).chrome = { runtime: {} };
});
```

#### レート制限

| サイト | リクエスト間隔 | ページ間隔 | 最大ページ数 |
|--------|--------------|-----------|-------------|
| マイナビ | 3秒 | 5秒 | 5 |
| doda | 4秒 | 7秒 | 10 |
| リクナビNEXT | 3秒 | 5秒 | 5 |

### 5.2 企業データのクリーニング

```typescript
// 会社名のクリーニング処理
function cleanCompanyName(name: string): string {
  return name
    // パイプ以降を削除
    .split(/[|｜]/)[0]
    // 市場表記を削除
    .replace(/【プライム市場】|【スタンダード市場】|【グロース市場】.../g, '')
    // グループ会社表記を削除
    .replace(/\(.*グループ.*\)/g, '')
    .replace(/（.*グループ.*）/g, '')
    // 全角英数字を半角に変換
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // 全角スペースを半角に
    .replace(/　/g, ' ')
    // 余分な空白を整理
    .replace(/\s+/g, ' ')
    .trim();
}
```

**注意**: `株式会社`、`有限会社`等の法人格は保持されます。

### 5.3 電話番号エンリッチメント

Google Maps Places APIを使用して企業の電話番号を取得します。

```typescript
// GoogleMapsService
async lookupPhoneNumber(companyName: string): Promise<string | null> {
  const response = await axios.get(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json`,
    {
      params: {
        input: this.normalizeCompanyName(companyName),
        inputtype: 'textquery',
        fields: 'formatted_phone_number',
        key: process.env.GOOGLE_MAPS_API_KEY,
        language: 'ja'
      }
    }
  );
  // ...
}
```

### 5.4 ステータス管理

営業パイプライン用のステータス：

| ステータス | 説明 | 色 |
|-----------|------|-----|
| new | 新規 | 青 |
| contacted | 連絡済み | 黄 |
| responded | 返答あり | 緑 |
| meeting | 商談中 | 紫 |
| won | 成約 | 緑（濃） |
| lost | 失注 | 灰 |
| ng | 対象外 | 赤 |

### 5.5 NGキーワードフィルタリング

デフォルトNGキーワード：
- 派遣
- ブラック
- 詐欺
- マルチ
- ネットワークビジネス

設定画面から追加・削除可能。

---

## 6. IPC API

### 6.1 データベース操作

```typescript
// 企業一覧取得
window.electronAPI.db.getCompanies(filters?: {
  search?: string;
  status?: string;
})

// 企業詳細取得
window.electronAPI.db.getCompany(id: number)

// 企業更新
window.electronAPI.db.updateCompany(id: number, updates: {
  status?: string;
  note?: string;
  ai_summary?: string;
  ai_tags?: string;
  phone?: string;
})
```

### 6.2 スクレイピング制御

```typescript
// スクレイピング開始
window.electronAPI.scraper.start({
  sources: string[];  // ['mynavi', 'doda', 'rikunabi']
  keywords?: string;
  location?: string;
})

// スクレイピング停止
window.electronAPI.scraper.stop()

// 進捗リスナー
window.electronAPI.scraper.onProgress((progress: {
  current: number;
  total: number;
  newCount: number;
  duplicateCount: number;
  source: string;
  status: string;
}) => void)

// ログリスナー
window.electronAPI.scraper.onLog((message: string) => void)
```

### 6.3 エンリッチメント

```typescript
// 電話番号一括取得開始
window.electronAPI.enrich.startPhoneLookup()

// 統計取得
window.electronAPI.enrich.getStats(): {
  total: number;
  withPhone: number;
  withoutPhone: number;
}

// 進捗リスナー
window.electronAPI.enrich.onProgress((progress) => void)

// ログリスナー
window.electronAPI.enrich.onLog((message: string) => void)
```

---

## 7. 画面仕様

### 7.1 ダッシュボード (`/`)

- 総企業数
- ステータス別内訳（カード表示）
- ソース別グラフ（棒グラフ）
- ステータス分布（色分け）

### 7.2 スクレイピング実行 (`/search`)

- サイト選択チェックボックス
  - ☑ マイナビ転職
  - ☑ doda
  - ☑ リクナビNEXT
- キーワード入力
- エリア選択
- 開始/停止ボタン
- リアルタイム進捗表示
  - 進捗バー
  - 新規件数
  - 重複件数
  - ログ出力

### 7.3 企業一覧 (`/list`)

- 検索ボックス（会社名、住所、メモ、AI要約）
- ステータスフィルター
- 一括選択
- ステータス一括変更
- 電話番号取得ボタン
- 詳細モーダル
  - 基本情報
  - 企業情報
  - 連絡先
  - メモ編集

### 7.4 設定 (`/settings`)

- NGキーワード管理
  - テキストエリア入力（1行1キーワード）
  - プレビュー表示
  - 保存ボタン

---

## 8. 環境設定

### .env ファイル

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
NODE_ENV=development
```

### データベースパス

```
Windows: %APPDATA%/local-job-hunter/companies.db
macOS: ~/Library/Application Support/local-job-hunter/companies.db
Linux: ~/.config/local-job-hunter/companies.db
```

---

## 9. 制限事項

### スクレイピング
- 最大実行時間: 60分
- スマートストップ: 連続50件重複で自動停止
- リクナビNEXT: SPA対応のため調整が必要な場合あり

### エンリッチメント
- Google Maps API利用量に依存
- 1社あたり1リクエスト

### データベース
- SQLite（シングルユーザー向け）
- 同時アクセス非推奨

---

## 10. 今後の課題

| 優先度 | 課題 | 状態 |
|--------|------|------|
| 高 | リクナビNEXTスクレイパーの安定化 | 🔧 調整中 |
| 中 | エリア選択のUI改善 | 📝 計画中 |
| 中 | CSV/Excelエクスポート機能 | 📝 計画中 |
| 低 | 複数ユーザー対応 | 📝 検討中 |

---

## 11. 開発コマンド

```bash
# 開発サーバー起動
npm run electron:dev

# Electronのみビルド
npm run build:electron

# 本番ビルド
npm run build

# パッケージング
npm run package
```

---

## 12. トラブルシューティング

### スクレイピングが動作しない

1. ネットワーク接続を確認
2. ログでエラーメッセージを確認
3. `headless: false`に変更してブラウザを表示
4. サイトの構造変更を確認

### 電話番号が取得できない

1. `.env`ファイルにAPIキーが設定されているか確認
2. Google Cloud ConsoleでAPIが有効化されているか確認
3. 請求設定が完了しているか確認

### データベースエラー

1. アプリを完全に終了
2. データベースファイルのバックアップ
3. 必要に応じてDBファイルを削除（データは消えます）

---

*この仕様書は開発途中のドキュメントです。最新情報はソースコードを参照してください。*
