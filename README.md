# Product Request Hub

Turn product feedback from Discord into structured, trackable product requests.

Discord上の会話から、残すべき機能要望だけを Product Request として構造化し、評価・優先順位付け・開発・リリースまで追跡するシステムです。
最初は **Zakkary** の内部運用ツールとして dogfooding しますが、システム本体に Zakkary 固有のロジックは入れていません（`Workspace → Project` 構造）。

```
Discord        要望の発生・起票・状況確認
   │  /request, メッセージ → Apps → 機能要望として登録, 同じ要望あり
   ▼
Request API    整理・評価・優先順位・開発管理   (Hono on Cloudflare Workers)
   │
   ▼
PostgreSQL     Single Source of Truth            (Supabase)
   ▲
   │
Management App Request一覧・詳細・Activity・設定 (Next.js)
```

## Repository

```
apps/
  api/        Hono API + Discord Interactions endpoint (Cloudflare Workers)
  web/        Next.js management app
packages/
  database/   Drizzle schema, migrations, seed
  shared/     Domain constants, zod schemas, status flow, permissions, API types
  discord/    Signature verification, payload builders, REST client, command registration
  ui/         Shared React components
docs/         architecture / discord-integration / database / operations
```

## Quick start

Requirements: Node.js 22+, pnpm 10, a PostgreSQL database (Supabase or `supabase start`).

```bash
pnpm install

# 1. Database
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
pnpm db:migrate
SEED_ADMIN_EMAIL=you@example.com \
SEED_DISCORD_GUILD_ID=<guild id> SEED_DISCORD_CHANNEL_ID=<#development id> \
pnpm db:seed

# 2. API (http://localhost:8787)
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in values
pnpm dev:api

# 3. Web (http://localhost:3000)
cp apps/web/.env.example apps/web/.env.local       # DEV_USER_EMAIL=you@example.com for local
pnpm dev:web

# 4. Discord commands
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... pnpm discord:register
```

Discord の Interactions Endpoint URL には `https://<api>/discord/interactions` を設定します。
詳細は [docs/operations.md](docs/operations.md) を参照してください。

## Scripts

| Command | |
| --- | --- |
| `pnpm typecheck` | 全パッケージの型チェック |
| `pnpm test` | ユニット / API統合テスト（PGlite上で実際のマイグレーションを適用） |
| `pnpm db:generate` | スキーマ変更からマイグレーションを生成 |
| `pnpm db:migrate` / `pnpm db:seed` | マイグレーション適用 / 初期データ投入 |
| `pnpm discord:register` | `/request` と Message Command を登録 |

## Design principles

1. Discordをチケット管理ツール化しない
2. 会話と正式なRequestを分ける
3. Projectはチャンネルから自動決定する
4. 起票者の入力項目を最小化する
5. DatabaseをSingle Source of Truthにする
6. Discord IntegrationからDatabaseへ直接書き込まない
7. すべての入力経路はRequest APIを通す
8. Discord固有情報をDomain Modelへ埋め込みすぎない
9. Zakkaryで使用しながら、最初から一般化可能な構造を維持する
10. 必要になるまでPublic APIやAI機能を増やさない
