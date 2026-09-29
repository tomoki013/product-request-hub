# Operations

## 構成

| Component | Platform |
| --- | --- |
| API (`apps/api`) | Cloudflare Workers |
| Web (`apps/web`) | Vercel（または Cloudflare Workers + OpenNext） |
| Database / Auth | Supabase |

## 初回セットアップ（Zakkary）

1. **Supabase**: プロジェクトを作成し、接続文字列（Transaction pooler, port 6543 推奨）を取得。Auth で Email (Magic Link) を有効化し、Site URL / Redirect URL に `https://<web>/auth/callback` を追加。
2. **Migrate & seed**
   ```bash
   export DATABASE_URL=postgresql://...
   pnpm db:migrate
   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME=Tomoki \
   SEED_DISCORD_GUILD_ID=<Zakkary Discord guild id> \
   SEED_DISCORD_CHANNEL_ID=<#development channel id> \
   pnpm db:seed
   ```
   これで次の状態になります。
   ```
   Workspace            Tomokichi
   Project              Zakkary
   Discord Integration  Zakkary Discord
   Channel Mapping      #development → Zakkary
   ```
3. **Discord Application**: Developer Portal でアプリを作成し、Bot を Zakkary Discord に招待（scope: `bot applications.commands`、権限は [discord-integration.md](discord-integration.md#必要な-bot-権限)）。
4. **API をデプロイ**
   ```bash
   cd apps/api
   wrangler secret put DATABASE_URL
   wrangler secret put DISCORD_PUBLIC_KEY
   wrangler secret put DISCORD_APPLICATION_ID
   wrangler secret put DISCORD_BOT_TOKEN
   wrangler secret put SUPABASE_URL
   # 任意: wrangler secret put SUPABASE_JWT_SECRET（未設定なら JWKS で検証）
   # wrangler.jsonc の vars.WEB_BASE_URL を本番の Web URL に変更
   pnpm deploy
   ```
   本番では Hyperdrive 経由の接続を推奨（`wrangler.jsonc` の `hyperdrive` バインディング `HYPERDRIVE` を有効化すると `DATABASE_URL` より優先されます）。
5. **Interactions Endpoint URL** に `https://<api>/discord/interactions` を設定（保存時に Discord が PING を送り、署名検証が通れば保存されます）。
6. **コマンド登録**
   ```bash
   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... pnpm discord:register
   ```
7. **Web をデプロイ**: 環境変数 `API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定。`DEV_USER_EMAIL` は本番で設定しないこと。

## Environment variables

### API (`apps/api`)

| Name | |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 接続文字列（`HYPERDRIVE` バインディングがあればそちらを優先） |
| `DISCORD_PUBLIC_KEY` | Interactions 署名検証 |
| `DISCORD_APPLICATION_ID` / `DISCORD_BOT_TOKEN` | Discord REST |
| `WEB_BASE_URL` | 「詳細を見る」リンクと CORS |
| `SUPABASE_URL` / `SUPABASE_JWT_SECRET` | Web の JWT 検証 |
| `AUTH_DEV_BYPASS` | ローカル専用。`true` で `x-dev-user-email` を信頼 |

### Web (`apps/web`)

| Name | |
| --- | --- |
| `API_BASE_URL` | Hono API の URL |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth |
| `DEV_USER_EMAIL` | ローカル専用。Supabase Auth をスキップ |

## メンバーの追加

- Discord から Request を登録したユーザーは Requester として自動作成されます。
- 管理画面 **Users** でロールを変更します。Web にログインさせる場合はメールアドレスを登録します（Magic Link のメールアドレスで照合）。

## 新しい Project / チャンネルを追加する

1. **Projects** で Project を追加（例: Remeet / `remeet`）。
2. 別サーバーなら **Discord → サーバーを追加**。
3. **Channel Mapping** でチャンネル ID と Project を紐付け。

## トラブルシューティング

| 症状 | 確認すること |
| --- | --- |
| 「このチャンネルは機能要望の登録先として設定されていません」 | Channel Mapping、`request_enabled`、Integration の status、Project の Active |
| Endpoint URL が保存できない | `DISCORD_PUBLIC_KEY`、API がデプロイ済みか |
| Request は作成されたがメッセージ/スレッドが出ない | Bot 権限、Workers のログ（`discord sync failed` / `thread creation failed`） |
| Web で 403 | `users.email` がログインしたメールアドレスと一致しているか |
