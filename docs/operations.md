# Operations

## 構成

| Component | Platform |
| --- | --- |
| API (`apps/api`) | Cloudflare Workers |
| Web (`apps/web`) | Cloudflare Workers（OpenNext）。Web → API は Service Binding |
| Database | Cloudflare D1 |
| Auth | Cloudflare Access（Zero Trust） |

## 初回セットアップ（Zakkary）

`./scripts/setup.sh` が 1〜4・6 を対話的に実行します（Cloudflare Access の設定は手作業）。手動で行う場合:

1. **Cloudflare**: `wrangler login`。D1 を作成し、表示された `database_id` を `apps/api/wrangler.jsonc` に設定します。
   ```bash
   cd apps/api && pnpm exec wrangler d1 create product-request-hub
   ```
2. **Migrate & seed**（本番 D1）
   ```bash
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
   pnpm deploy
   wrangler secret put DISCORD_PUBLIC_KEY
   wrangler secret put DISCORD_APPLICATION_ID
   wrangler secret put DISCORD_BOT_TOKEN
   ```
5. **Web をデプロイ**（API を先にデプロイしておくこと。Service Binding が API Worker を参照します）
   ```bash
   pnpm --filter @prh/web deploy
   ```
6. **Cloudflare Access で Web を保護**: Zero Trust → Access → Applications → Self-hosted。Application domain に Web の URL、Policy は登録メンバーのメールアドレスを Allow。作成後の **Team domain** と **AUD タグ** を `apps/api/wrangler.jsonc` の `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` に設定して API を再デプロイします。`WEB_BASE_URL` も本番の Web URL にしてください。
7. **Interactions Endpoint URL** に `https://<api>/discord/interactions` を設定（保存時に Discord が PING を送り、署名検証が通れば保存されます）。
8. **コマンド登録**
   ```bash
   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... pnpm discord:register
   ```

## Environment variables

### API (`apps/api`)

| Name | |
| --- | --- |
| `DB` (D1 binding) | `wrangler.jsonc` の `d1_databases` |
| `DISCORD_PUBLIC_KEY` | Interactions 署名検証（secret） |
| `DISCORD_APPLICATION_ID` / `DISCORD_BOT_TOKEN` | Discord REST（secret） |
| `WEB_BASE_URL` | 「詳細を見る」リンクと CORS（vars） |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Web の Access JWT 検証（vars） |
| `AUTH_DEV_BYPASS` | ローカル専用（`.dev.vars`）。`true` で `x-dev-user-email` を信頼。本番では絶対に設定しない |

### Web (`apps/web`)

| Name | |
| --- | --- |
| `API` (service binding) | Workers 上では API Worker を Service Binding で呼びます |
| `API_BASE_URL` | Binding が無い環境（`next dev` など）で使う API の URL |
| `DEV_USER_EMAIL` | ローカル専用。Access をスキップ。本番では設定しない |

## ローカル開発

```bash
pnpm install
pnpm db:migrate:local
SEED_ADMIN_EMAIL=you@example.com pnpm db:seed:local

cp apps/api/.dev.vars.example apps/api/.dev.vars   # Discord の値は空でも管理画面は動く
pnpm dev:api                                       # http://localhost:8787（ローカル D1 = apps/api/.wrangler）

cp apps/web/.env.example apps/web/.env.local       # DEV_USER_EMAIL=you@example.com
pnpm dev:web
```

## メンバーの追加

- Discord から Request を登録したユーザーは Requester として自動作成されます。
- 管理画面 **Users** でロールを変更します。Web にログインさせる場合はメールアドレスを登録し、Cloudflare Access の Policy にも同じメールアドレスを追加します（Access の JWT のメールアドレスで照合）。

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
| Web で 403 | `users.email` が Access でログインしたメールアドレスと一致しているか |
| Web で 401 / 「Cloudflare Access のトークンがありません」 | Web が Access で保護されているか、API の `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` が正しいか |
