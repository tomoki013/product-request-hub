# Database

Cloudflare D1（SQLite）。スキーマは `packages/database/src/schema.ts`（Drizzle `sqlite-core`）、マイグレーションは `packages/database/migrations`（drizzle-kit が生成するプレーン SQL を `wrangler d1 migrations apply` で適用）。

## SQLite / D1 での型の扱い

| ドメイン | D1 |
| --- | --- |
| id | `TEXT` の UUID（アプリ側で `crypto.randomUUID()` を採番） |
| enum（status, priority, role ...） | `TEXT`。値の集合は `@prh/shared` の定数で型付けし、API 境界の zod で検証（DB に CHECK 制約は置いていません） |
| timestamp | `INTEGER`（epoch ミリ秒。Drizzle が `Date` に変換） |
| jsonb | `TEXT`（JSON。Drizzle が object に変換） |
| boolean | `INTEGER` 0/1 |

## Tables

| Table | 用途 |
| --- | --- |
| `workspaces` | テナント（例: Tomokichi） |
| `projects` | Workspace 内のプロダクト（例: Zakkary）。`(workspace_id, slug)` unique |
| `users` | Workspace のメンバーとロール。`(workspace_id, email)` unique |
| `external_identities` | Discord / GitHub / Slack の外部 ID。`users` から分離。`(user_id, provider)` unique |
| `discord_integrations` | 接続済み Discord サーバー。`discord_guild_id` unique |
| `discord_channel_mappings` | `(guild, channel) → project`。`request_enabled` で有効/無効 |
| `releases` | Target Release の候補（Project ごと） |
| `request_number_sequences` | Workspace ごとの REQ 番号カウンタ |
| `requests` | Request 本体。Discord 固有情報は持たない |
| `request_origins` | 入力元（provider, external_* ID, URL, metadata） |
| `request_sources` | 同じ要望が発生した 1 回 = 1 行 |
| `request_links` | GitHub Issue / Pull Request / Release へのリンク |
| `request_events` | Activity Timeline / 監査ログ（append-only） |

## requests

```
id, workspace_id, project_id
request_number            -- (workspace_id, request_number) unique → REQ-0001
title, description
status                    -- new | reviewing | backlog | planned | in_progress | released | not_planned
priority                  -- low | medium | high | urgent
impact, effort            -- low | medium | high
requester_id, assignee_id -- users
target_release_id         -- releases
duplicate_of_id           -- requests (Duplicate Merge)
source_provider           -- discord | slack | web | api
created_at, updated_at, released_at
```

## Request Count

```
Request Count = COUNT(request_sources)
                of the request itself + requests merged into it (duplicate_of_id)
```

作成時に起票者自身の 1 件が `request_sources` に入るため、新規 Request の Requests は 1 から始まります。

## Duplicate

- `REQ-0048.duplicate_of_id = REQ-0023.id` を設定するだけで、REQ-0048 は削除しません。Activity Log も両方に残ります。
- 統合チェーンは作りません。統合先がすでに重複なら、その正の Request に統合します。統合される側に重複がぶら下がっていれば、正の Request に付け替えます。
- 一覧はデフォルトで重複を除外します（`includeDuplicates=true` で表示）。

## REQ 番号

D1 は対話的トランザクションを持たないため、`db.batch([...])`（アトミックに実行される）で次の順に書き込みます。

1. `request_number_sequences` を `INSERT ... ON CONFLICT DO UPDATE SET last_number = last_number + 1`
2. `requests` を、`(select last_number from request_number_sequences where workspace_id = ?)` を `request_number` にして挿入
3. origin / source / `request_created` イベントを挿入

D1 は書き込みを直列化するので、同時作成でも番号は重複しません（テスト `allocates distinct numbers for concurrent creates`）。

## Activity Timeline の順序

`request_events` は `(created_at, rowid)` の順で読み出します。`created_at` はミリ秒精度なので同一ミリ秒に複数イベントが入り得ますが、追記専用テーブルの `rowid` は単調増加のため順序が保たれます。

## 認可

API は D1 バインディング経由でのみ DB に到達でき（D1 には公開エンドポイントがありません）、認可はアプリケーション層で行います。

## Migrations

```bash
# スキーマ(packages/database/src/schema.ts)を変更したら SQL を生成
pnpm db:generate
# ローカル D1 (apps/api/.wrangler) / 本番 D1 に適用
pnpm db:migrate:local
pnpm db:migrate
```

初期データは `pnpm db:seed`（本番）/ `pnpm db:seed:local`（ローカル）。冪等な SQL を生成して `wrangler d1 execute` で流します。

テスト (`apps/api/test`) は Miniflare の実 D1（workerd + SQLite）上で同じマイグレーションを適用して実行します。
