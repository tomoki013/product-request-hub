#!/usr/bin/env bash
# Product Request Hub 初回セットアップ（Cloudflare D1 / Workers）
#
#   ./scripts/setup.sh
#
# 事前準備（docs/operations.md 参照）:
#   - `wrangler login` 済みの Cloudflare アカウント
#   - Discord アプリ（Application ID / Public Key / Bot Token）と Bot のサーバー招待
#
# 実行内容:
#   1. D1 データベースの作成（wrangler.jsonc に database_id を書き込み）
#   2. マイグレーションと初期データ（Tomokichi / Zakkary / #development → Zakkary / 管理者）
#   3. API の secrets 登録と Workers へのデプロイ
#   4. Web（OpenNext）のデプロイ
#   5. Discord コマンド登録
# 最後に Cloudflare Access の設定（手作業）を案内します。
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME=product-request-hub
API_WRANGLER=apps/api/wrangler.jsonc

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
# set_var FILE KEY VALUE: wrangler.jsonc の `"KEY": "..."` を書き換える
set_var() {
  KEY=$2 VALUE=$3 perl -0pi -e 's/("\Q$ENV{KEY}\E"\s*:\s*")[^"]*(")/$1$ENV{VALUE}$2/' "$1"
}

require pnpm
require node
require perl

echo "== Product Request Hub setup =="
echo "（環境変数で渡した値は質問をスキップします）"
echo

echo "-- 管理者"
ask SEED_ADMIN_EMAIL "管理者のメールアドレス（Cloudflare Access でログインするメール）"
ask SEED_ADMIN_NAME "管理者の表示名" "Admin"

echo "-- Discord"
ask DISCORD_APPLICATION_ID "Application ID"
ask DISCORD_PUBLIC_KEY "Public Key"
ask_secret DISCORD_BOT_TOKEN "Bot Token"
ask SEED_DISCORD_GUILD_ID "Zakkary のサーバー ID"
ask SEED_DISCORD_CHANNEL_ID "#development のチャンネル ID"

echo "-- Cloudflare Access（未作成なら空のまま Enter。最後に手順を案内します）"
ask CF_ACCESS_TEAM_DOMAIN "Access の Team domain (your-team.cloudflareaccess.com)" ""
ask CF_ACCESS_AUD "Access アプリケーションの AUD タグ" ""

for v in SEED_ADMIN_EMAIL DISCORD_APPLICATION_ID DISCORD_PUBLIC_KEY DISCORD_BOT_TOKEN \
  SEED_DISCORD_GUILD_ID SEED_DISCORD_CHANNEL_ID; do
  [[ -n ${!v} ]] || { echo "✗ $v が空です" >&2; exit 1; }
done
export SEED_ADMIN_EMAIL SEED_ADMIN_NAME SEED_DISCORD_GUILD_ID SEED_DISCORD_CHANNEL_ID

echo
echo "== 1/6 依存関係"
pnpm install --frozen-lockfile
pnpm --dir apps/api exec wrangler whoami >/dev/null 2>&1 || pnpm --dir apps/api exec wrangler login

echo "== 2/6 D1 データベース"
find_db_id() {
  pnpm --dir apps/api exec wrangler d1 list --json 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.name===process.argv[1]);if(r)console.log(r.uuid)})' "$DB_NAME"
}
DB_ID=$(find_db_id || true)
if [[ -z $DB_ID ]]; then
  pnpm --dir apps/api exec wrangler d1 create "$DB_NAME"
  DB_ID=$(find_db_id)
fi
[[ -n $DB_ID ]] || { echo "✗ D1 の database_id を取得できません" >&2; exit 1; }
set_var "$API_WRANGLER" database_id "$DB_ID"
echo "  ✓ $DB_NAME ($DB_ID)  ← $API_WRANGLER に書き込みました（コミットしてください）"

echo "== 3/6 マイグレーションと初期データ"
pnpm db:migrate
pnpm db:seed

echo "== 4/6 API デプロイ (Cloudflare Workers)"
[[ -n $CF_ACCESS_TEAM_DOMAIN ]] && set_var "$API_WRANGLER" CF_ACCESS_TEAM_DOMAIN "$CF_ACCESS_TEAM_DOMAIN"
[[ -n $CF_ACCESS_AUD ]] && set_var "$API_WRANGLER" CF_ACCESS_AUD "$CF_ACCESS_AUD"
pushd apps/api >/dev/null
put_secret() { printf '%s' "$2" | pnpm exec wrangler secret put "$1" >/dev/null && echo "  ✓ $1"; }
# 初回は Worker がまだ無いので先にデプロイしてから secrets を入れる
pnpm exec wrangler deploy | tee /tmp/prh-api-deploy.log
put_secret DISCORD_PUBLIC_KEY "$DISCORD_PUBLIC_KEY"
put_secret DISCORD_APPLICATION_ID "$DISCORD_APPLICATION_ID"
put_secret DISCORD_BOT_TOKEN "$DISCORD_BOT_TOKEN"
API_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' /tmp/prh-api-deploy.log | head -1 || true)
popd >/dev/null

echo "== 5/6 Web デプロイ (OpenNext on Workers)"
pnpm --filter @prh/web deploy | tee /tmp/prh-web-deploy.log
WEB_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' /tmp/prh-web-deploy.log | tail -1 || true)
if [[ -n $WEB_URL ]]; then
  # CORS / 「詳細を見る」リンクに使われる。Access のドメインを使うなら後で書き換える。
  set_var "$API_WRANGLER" WEB_BASE_URL "$WEB_URL"
  (cd apps/api && pnpm exec wrangler deploy >/dev/null) && echo "  ✓ WEB_BASE_URL=$WEB_URL"
fi

echo "== 6/6 Discord コマンド登録"
DISCORD_APPLICATION_ID=$DISCORD_APPLICATION_ID DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN \
  DISCORD_GUILD_ID=$SEED_DISCORD_GUILD_ID pnpm discord:register

API_URL=${API_URL:-https://<API の URL>}
WEB_URL=${WEB_URL:-https://<Web の URL>}
cat <<EOF

✅ セットアップ完了

残りの手作業:
  1. Discord Developer Portal → General Information → Interactions Endpoint URL
       $API_URL/discord/interactions
  2. Cloudflare Access で Web ($WEB_URL) を保護（これをしないと管理画面は 401 になります）
       Zero Trust → Access → Applications → Add → Self-hosted
         Application domain: ${WEB_URL#https://}
         Policy: Allow / Emails: $SEED_ADMIN_EMAIL
       作成後、Team domain と AUD タグを控えて:
         $API_WRANGLER の CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD に設定し
         cd apps/api && pnpm exec wrangler deploy
       （setup.sh を CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD 付きで再実行しても構いません）
  3. 変更した $API_WRANGLER をコミット

動作確認: #development で /request
EOF
