# Architecture

## Overview

```
Discord App ──(Interactions, Ed25519 signed)──┐
                                             ▼
Next.js Management App ──(Bearer JWT)──▶ Hono API on Cloudflare Workers
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                   RequestService      AdminService      IdentityService
                          │                                      
                          ▼                                      
                   Supabase PostgreSQL (Drizzle)        Discord REST API
                                                        (DiscordSync notifier)
```

- **Single Source of Truth** はデータベース。Discord は表示・入力インターフェース、GitHub は開発情報。
- **API First**: Discord アダプタ (`apps/api/src/discord/interactions.ts`) も Web 管理画面も、同じ `RequestService` を通ります。Discord アダプタは `@prh/database` を import しません。
- Web 管理画面 (`apps/web`) は DB に接続せず、Server Components / Server Actions から内部 API (`/api/*`) を呼び出します。

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Transport | `apps/api/src/routes/*`, `apps/api/src/discord/interactions.ts` | 認証、入力の検証 (zod)、レスポンス整形 |
| Business logic | `apps/api/src/services/*` | 権限チェック、ステータス遷移、REQ番号採番、Activity記録、重複統合 |
| Notifications | `apps/api/src/services/notifier.ts`, `apps/api/src/discord/sync.ts` | 変更の外部反映（Discordメッセージ更新・スレッド通知） |
| Persistence | `packages/database` | スキーマ、マイグレーション |
| Domain | `packages/shared` | 定数、ステータスフロー、権限マトリクス、API型 |

`RequestService` は `RequestNotifier` インターフェースにのみ依存し、Discord を知りません。Slack 連携を追加する場合は Notifier と入力アダプタを追加するだけで、ドメインモデルは変わりません。

## Internal API (MVP)

MVP では External API として公開しません（Web 管理画面専用・Supabase Auth 必須）。必要になったら `/api/v1/` として Public API 化します。

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/requests` | Web から Request 作成（`origin.provider = "web"`） |
| `GET` | `/api/requests` | 一覧（`status`, `projectId`, `priority`, `assigneeId`, `q`, `limit`, `offset`） |
| `GET` | `/api/requests/:id` | 詳細（UUID または `REQ-0023`） |
| `PATCH` | `/api/requests/:id` | Status / Priority / Impact / Effort / Assignee / Target Release |
| `GET` | `/api/requests/:id/events` | Activity |
| `POST` | `/api/requests/:id/sources` | 同じ要望あり |
| `POST` | `/api/requests/:id/merge` | Duplicate Merge (`{ duplicateOfId }`) |
| `POST` / `DELETE` | `/api/requests/:id/links[/:linkId]` | GitHub Issue / PR / Release のリンク |
| `GET` | `/api/me` | ログインユーザーと権限 |
| `GET` / `POST` / `PATCH` | `/api/projects`, `/api/releases` | Project / Release 設定 |
| `GET` / `POST` | `/api/discord/integrations` | Discord サーバー |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/channel-mappings` | Channel Mapping |
| `GET` / `POST` / `PATCH` | `/api/users` | ユーザーとロール |
| `POST` | `/discord/interactions` | Discord Interactions Endpoint（署名検証） |

エラーは `{ "error": { "code", "message", "details"? } }` 形式。`code` は `bad_request | unauthorized | forbidden | not_found | conflict | invalid_transition | channel_not_mapped`。

## Status flow

```
New ─▶ Reviewing ─┬─▶ Backlog
                  ├─▶ Planned ─▶ In Progress ─▶ Released
                  └─▶ Not Planned
```

許可される遷移は `packages/shared/src/status.ts` に定義しています（再検討のための Backlog ⇄ Planned、Released → Reviewing の再オープンなども含む）。

## Permissions

ロールは累積的です（上位ロールは下位ロールの権限をすべて持つ）。定義は `packages/shared/src/permissions.ts`。

| Role | Permissions |
| --- | --- |
| Requester | Request作成、同じ要望追加、閲覧 |
| Developer | + Status変更（Planned / Not Planned 以外）、Assignee、Effort、GitHub連携 |
| Product Manager | + Priority、Impact、Planned / Not Planned、Duplicate Merge、Target Release |
| Admin | + Workspace、Project、Discord Integration、Channel Mapping、Users |

Discord から初めて操作したユーザーは、Channel Mapping の Workspace に **Requester** として自動作成されます。

## Authentication

- **Discord**: Ed25519 署名検証 (`packages/discord/src/verify.ts`)。ユーザーは `external_identities (provider = discord)` で解決。
- **Web**: Supabase Auth（Magic Link）。API は JWT を検証し（`SUPABASE_JWT_SECRET` の HS256、未設定なら JWKS）、`external_identities (provider = supabase)` → 未リンクならメールアドレスで事前登録済みユーザーに紐付けます。未登録のメールアドレスは 403。
- **Local**: `AUTH_DEV_BYPASS=true` のときだけ `x-dev-user-email` ヘッダーを信頼します（本番では絶対に設定しない）。
