# Database

Supabase PostgreSQL。スキーマは `packages/database/src/schema.ts`（Drizzle）、マイグレーションは `packages/database/migrations`。

## Tables

| Table | 用途 |
| --- | --- |
| `workspaces` | テナント（例: Tomokichi） |
| `projects` | Workspace 内のプロダクト（例: Zakkary）。`(workspace_id, slug)` unique |
| `users` | Workspace のメンバーとロール。`(workspace_id, email)` unique |
| `external_identities` | Discord / GitHub / Slack / Supabase の外部 ID。`users` から分離。`(user_id, provider)` unique |
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

`request_number_sequences` を `INSERT ... ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING` で更新し、Request 挿入と同じトランザクションで採番します。行ロックにより同時作成でも重複しません。

## Row Level Security

API は特権ロールで接続し、認可をアプリケーション層で行います。`0001_enable_rls.sql` で全テーブルの RLS をポリシーなしで有効化し、Supabase の `anon` / `authenticated` ロール（PostgREST）から直接読み書きできないようにしています。

## Migrations

```bash
# スキーマを変更したら
pnpm db:generate
# 適用
DATABASE_URL=... pnpm db:migrate
```

テスト (`apps/api/test`) は PGlite 上で同じマイグレーションを適用して実行します。
