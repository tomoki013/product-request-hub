#!/usr/bin/env bash
# Product Request Hub 初回セットアップ
#
#   ./scripts/setup.sh
#
# 事前準備（docs/operations.md 参照）:
#   - Supabase プロジェクト（DB 接続文字列 / Project URL）
#   - Discord アプリ（Application ID / Public Key / Bot Token）と Bot のサーバー招待
#   - `wrangler login` 済みの Cloudflare アカウント
#
# 実行内容:
#   1. DB マイグレーション
#   2. 初期データ（Tomokichi / Zakkary / #development → Zakkary / 管理者）
#   3. API の secrets 登録と Cloudflare Workers へのデプロイ
#   4. Discord コマンド登録
set -euo pipefail

cd "$(dirname "$0")/.."

ask() { # ask VAR "質問" [default]
  local var=$1 prompt=$2 default=${3:-} value
  if [[ -n ${!var:-} ]]; then return; fi
  read -r -p "$prompt${default:+ [$default]}: " value
  printf -v "$var" '%s' "${value:-$default}"
}
ask_secret() { # 画面に表示しない
  local var=$1 prompt=$2 value
  if [[ -n ${!var:-} ]]; then return; fi
  read -r -s -p "$prompt: " value
  echo
  printf -v "$var" '%s' "$value"
}
require() { command -v "$1" >/dev/null || { echo "✗ $1 が必要です" >&2; exit 1; }; }

require pnpm
require node

echo "== Product Request Hub setup =="
echo "（環境変数で渡した値は質問をスキップします）"
echo

echo "-- Supabase"
ask_secret DATABASE_URL "DB 接続文字列 (Transaction pooler, port 6543)"
ask SUPABASE_URL "Project URL (https://xxxx.supabase.co)"

echo "-- 管理者"
ask SEED_ADMIN_EMAIL "管理者のメールアドレス（管理画面ログイン用）"
ask SEED_ADMIN_NAME "管理者の表示名" "Admin"

echo "-- Discord"
ask DISCORD_APPLICATION_ID "Application ID"
ask DISCORD_PUBLIC_KEY "Public Key"
ask_secret DISCORD_BOT_TOKEN "Bot Token"
ask SEED_DISCORD_GUILD_ID "Zakkary のサーバー ID"
ask SEED_DISCORD_CHANNEL_ID "#development のチャンネル ID"

echo "-- Web"
ask WEB_BASE_URL "管理画面の URL（未定なら後で変更可）" "http://localhost:3000"

for v in DATABASE_URL SUPABASE_URL SEED_ADMIN_EMAIL DISCORD_APPLICATION_ID DISCORD_PUBLIC_KEY \
  DISCORD_BOT_TOKEN SEED_DISCORD_GUILD_ID SEED_DISCORD_CHANNEL_ID; do
  [[ -n ${!v} ]] || { echo "✗ $v が空です" >&2; exit 1; }
done
export DATABASE_URL SEED_ADMIN_EMAIL SEED_ADMIN_NAME SEED_DISCORD_GUILD_ID SEED_DISCORD_CHANNEL_ID

echo
echo "== 1/4 依存関係"
pnpm install --frozen-lockfile

echo "== 2/4 DB マイグレーションと初期データ"
pnpm db:migrate
pnpm db:seed

echo "== 3/4 API デプロイ (Cloudflare Workers)"
pushd apps/api >/dev/null
pnpm exec wrangler whoami >/dev/null 2>&1 || pnpm exec wrangler login
put_secret() { printf '%s' "$2" | pnpm exec wrangler secret put "$1" >/dev/null && echo "  ✓ $1"; }
# 初回は Worker がまだ無いので先にデプロイしてから secrets を入れる
pnpm exec wrangler deploy --var "WEB_BASE_URL:$WEB_BASE_URL" | tee /tmp/prh-deploy.log
put_secret DATABASE_URL "$DATABASE_URL"
put_secret DISCORD_PUBLIC_KEY "$DISCORD_PUBLIC_KEY"
put_secret DISCORD_APPLICATION_ID "$DISCORD_APPLICATION_ID"
put_secret DISCORD_BOT_TOKEN "$DISCORD_BOT_TOKEN"
put_secret SUPABASE_URL "$SUPABASE_URL"
API_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' /tmp/prh-deploy.log | head -1 || true)
popd >/dev/null

echo "== 4/4 Discord コマンド登録"
DISCORD_APPLICATION_ID=$DISCORD_APPLICATION_ID DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN \
  DISCORD_GUILD_ID=$SEED_DISCORD_GUILD_ID pnpm discord:register

API_URL=${API_URL:-https://<API の URL>}
cat <<EOF

✅ セットアップ完了

残りの手作業:
  1. Discord Developer Portal → General Information → Interactions Endpoint URL
       $API_URL/discord/interactions
  2. Vercel に apps/web をデプロイ（Root Directory: apps/web）。環境変数:
       API_BASE_URL=$API_URL
       NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
       NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase の anon key>
  3. Supabase → Authentication → URL Configuration
       Site URL / Redirect URL: <Web の URL>/auth/callback
  4. Web の URL が決まったら: WEB_BASE_URL=<Web の URL> で再実行、または
       cd apps/api && pnpm exec wrangler deploy --var WEB_BASE_URL:<Web の URL>

動作確認: #development で /request
EOF
