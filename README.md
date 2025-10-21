了解！“**今日は Prisma を後でやる**”前提で、**いまの状態をそのまま記録**できる README テンプレを用意しました。コピペで `README.md` にどうぞ👇

---

# stripe-connect-express

安定重視セット（Node 20 LTS / Next 15 / React 19 / Tailwind v4 / Stripe / PostgreSQL）。
**Prisma は後で導入**する方針の現状を記録しています。

---

## 技術スタック（固定方針）

* **Node.js:** 20 LTS（推奨）
* **Next.js:** 15.3.3（Pages Router）
* **React / ReactDOM:** 19.0.0
* **Tailwind CSS:** 4.1.15（`@tailwindcss/postcss` 経由）
* **TypeScript:** 5.x
* **ESLint:** 9.x（`eslint-config-next` 15.x）
* **Stripe:**

    * サーバ SDK：`stripe@19.1.0`
    * ブラウザ：`@stripe/stripe-js@8.1.0`
* **PostgreSQL クライアント:** `pg@8.16.3`
* **Prisma:** *後で導入*（現在は schema 未作成・postinstall 無効）
* その他：`zod`, `zustand`, `firebase`, `motion` など

> **再現性のため** lockfile をコミットし、インストールは `npm ci` を使用。

---

## ディレクトリ構成（抜粋）

```
src/
  pages/
    _app.tsx
    index.tsx
  styles/
    globals.css      // @import "tailwindcss";
postcss.config.mjs  // { plugins: { "@tailwindcss/postcss": {} } }
package.json
tsconfig.json
```

---

## 必要条件

* Node 20.x（`.nvmrc` を使う場合は `20`）
* npm 10 以上推奨
* （後日）PostgreSQL 接続先

---

## セットアップ

### 1) 依存関係のインストール（現在は Prisma を後で）

```bash
# 初回またはクリーン時
npm ci
```

> **注**: `postinstall: prisma generate` は一時的に無効化しています（Prisma schema 未作成のため）。

### 2) 開発サーバ

```bash
npm run dev
```

### 3) 本番ビルド

```bash
npm run build
npm run start
```

---

## Tailwind v4 の配線（確認用）

* `postcss.config.mjs`

  ```js
  export default {
    plugins: {
      "@tailwindcss/postcss": {},
    },
  }
  ```
* `src/styles/globals.css`

  ```css
  @import "tailwindcss";
  /* 追加のグローバルスタイルがあればここに */
  ```
* `src/pages/_app.tsx`

  ```tsx
  import type { AppProps } from "next/app";
  import "../styles/globals.css";

  export default function MyApp({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />;
  }
  ```

**テスト例（どこかのページで）**

```tsx
<div className="p-8 bg-blue-500 text-white text-2xl rounded-xl">
  tailwind test
</div>
```

---

## TypeScript 設定（要点）

`tsconfig.json` 主要項目：

* `"module": "esnext"`, `"moduleResolution": "bundler"`（Next 15/TS5 向け）
* `"jsx": "preserve"`
* `"strict": true`, `"noEmit": true`
* `"paths": { "@/*": ["./src/*"] }`

---

## 環境変数（.env サンプル）

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# （後日）PostgreSQL / Prisma 導入時に使用
# DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
```

> **注意**: 機密情報は *絶対に* リポジトリへコミットしないでください。

---

## Prisma はあとで導入（現在の状態）

* いまは **Prisma の schema 未作成**。`postinstall` も一旦 **無効**。
* 導入時にやること（メモ）：

    1. `mkdir prisma`
    2. `prisma/schema.prisma` を作成（例）

       ```prisma
       generator client {
         provider = "prisma-client-js"
       }
       datasource db {
         provider = "postgresql"
         url      = env("DATABASE_URL")
       }
  
       model User {
         id        String   @id @default(cuid())
         email     String   @unique
         createdAt DateTime @default(now())
       }
       ```
    3. `.env` に `DATABASE_URL` を設定
    4. マイグレーション or 反映

       ```bash
       npx prisma migrate dev --name init
       # もしくは
       # npx prisma db push
       ```
    5. クライアント生成

       ```bash
       npx prisma generate
       ```
    6. `package.json` に `postinstall: "prisma generate"` を **再び追加**
       ついでに `build` 前にも `prisma generate` が入っているか確認

---

## よく使うコマンド（Windows / PowerShell）

**キャッシュクリア（`rm -rf` の代替）**

```powershell
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
if (Test-Path .next)        { Remove-Item -Recurse -Force .next }
npm ci
```

---

## Lint / 型チェック

```bash
npm run lint
# Next.js はビルド時に型チェックも行われます
```

---

## トラブルシュート

* **Tailwind が効かない**

    * `postcss.config.mjs` のプラグインが `@tailwindcss/postcss` になっているか
    * `src/styles/globals.css` に `@import "tailwindcss";`
    * `src/pages/_app.tsx` で `globals.css` を import
    * 変更後は **dev サーバを再起動**
* **`npm install` で Prisma エラー**

    * いまは `postinstall` を無効化しているはず。誤って有効な場合、Prisma schema 未作成だと落ちます。
* **Windows でファイル削除エラー**

    * 実行中の `node` / `next` プロセスや IDE が掴んでいないか確認 → いったん停止して再実行

---

## ライセンス

Private / Internal

---

必要なら、この README に **実際の `package.json` スクリプト**（現状 or 目標運用）も差し込みます。欲しい書式（バッジ、章構成など）があれば言ってください！
