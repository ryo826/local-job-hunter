# CLAUDE.md - Local Job Hunter

## プロジェクト概要

日本の求人サイト（マイナビ転職、doda、リクナビNEXT）から企業情報を自動収集し、B2B営業のリード管理を行うElectronデスクトップアプリ。

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- **状態管理**: Zustand + TanStack Query
- **UIコンポーネント**: Radix UI + Lucide React
- **バックエンド**: Electron 40 + better-sqlite3
- **スクレイピング**: Playwright

## プロジェクト構造

```
src/                    # React フロントエンド
├── components/         # UIコンポーネント
├── pages/              # ページ（Dashboard, List, Search, Settings）
├── stores/             # Zustand ストア
├── config/             # 設定
└── types.ts            # 型定義

electron/               # Electron メインプロセス
├── main.ts             # エントリーポイント + IPCハンドラ
├── preload.ts          # レンダラーへのAPI橋渡し
├── database.ts         # SQLite接続
├── scraping-engine.ts  # スクレイピングエンジン
├── repositories/       # データアクセス層
├── services/           # ビジネスロジック
└── strategies/         # サイト別スクレイパー（mynavi.ts, doda.ts, rikunabi.ts）
```

## 開発コマンド

```bash
npm run electron:dev    # Electron開発モード起動
npm run dev             # Vite開発サーバーのみ
npm run build           # 本番ビルド
npm run lint            # ESLint実行
```

## データベース

SQLite（better-sqlite3）を使用。主要テーブル:
- `companies` - 企業情報（営業リード）
- `jobs` - 求人情報
- `ng_keywords` - NGキーワード
- `scraping_logs` - 実行ログ

DBパス: `%APPDATA%/local-job-hunter/companies.db` (Windows)

## IPC通信

`window.electronAPI` でレンダラーからElectronにアクセス:
- `db.*` - データベース操作
- `scraper.*` - スクレイピング制御
- `enrich.*` - 電話番号エンリッチメント

## 重要な型定義

`src/types.ts` に主要な型が定義されている。

## 外部API

- Google Maps Places API（電話番号取得用）
- APIキーは `.env` の `GOOGLE_MAPS_API_KEY` で設定

## 開発時の注意点

- スクレイピングはレート制限あり（3-7秒間隔）
- 連続50件重複でスマートストップ
- リクナビNEXTはSPA対応のため調整が必要な場合あり
- Electronメインプロセスの変更は `npm run build:electron` が必要

## 関連ドキュメント

- `docs/SPECIFICATION.md` - 詳細仕様書
