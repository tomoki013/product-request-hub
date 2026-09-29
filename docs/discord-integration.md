# Discord Integration

## 運用ルール

- 既存の開発チャンネルをそのまま使う。通常の会話は自動チケット化しない。
- 正式に残したい要望だけを Request 化する。起票は要望を受け取った本人が行う（開発者に集中させない）。
- 詳細な議論は Request 作成時に作られる Thread で行う。

## 入口

| 入口 | 操作 |
| --- | --- |
| Slash Command | `/request` |
| Message Command | メッセージ → Apps → **機能要望として登録** |
| Button | Request メッセージの **同じ要望あり** |

コマンドは `pnpm discord:register` で登録します（`DISCORD_GUILD_ID` を指定するとそのサーバーのみ・即時反映）。

## モーダル

```
機能要望を登録
  タイトル   (必須, 100文字)
  内容       (必須, Message Command では元メッセージで prefill)
  要望元     (任意: Customer / Sales / Management / Internal / Support / Developer / Other)
```

Project 欄はありません。Priority / Status / Assignee / Impact / Effort / Target Release も起票者には入力させません。
モーダルは Discord の Label コンポーネント（テキスト入力と String Select）を使用しています。

## Project の決定

```
interaction.guild_id + interaction.channel_id
        │
        ▼
discord_channel_mappings (request_enabled = true, integration active, project active)
        │
        ▼
workspace_id, project_id
```

クライアントから Project ID を受け取る経路はありません（Discord origin の zod スキーマに `projectId` が存在しない）。
マッピングがないチャンネルでは、コマンド実行時点でエフェメラルメッセージで案内します。
スレッド内で `/request` を実行した場合もスレッドの channel_id で判定されるため、マッピング済みの親チャンネルで実行してください。

## /request フロー

```
/request ─▶ Modal (type 9)
Modal submit ─▶ Deferred ephemeral (type 5)          ← 3秒制限のため即応答
   └─ waitUntil:
        Channel Mapping → Workspace
        Discord user → users (初回は Requester として作成)
        RequestService.create
            REQ番号採番 (request_number_sequences, per workspace)
            requests / request_origins / request_sources / request_events
        Bot メッセージ投稿 (embed + [詳細を見る] [同じ要望あり])
        Thread 作成 ("REQ-0023 店舗をお気に入り保存したい")
        request_origins に message_id / thread_id を保存
        エフェメラル応答を「✅ REQ-0023 を登録しました」に更新
```

Message Command の場合は、Bot メッセージが元メッセージへの返信になり、`request_origins.external_url` に元メッセージの URL、`metadata.sourceMessageId` に ID が入ります。

## 同じ要望あり

```
[同じ要望あり] ─▶ エフェメラル: 要望元を選択 (String Select)
選択 ─▶ Deferred update (type 6)
   └─ waitUntil: RequestService.addSource → Request メッセージの Requests 数を更新
```

「いいね」ではなく、実際に同じ要望が発生した回数として `request_sources` に 1 行追加します。
重複として統合済みの Request に追加した場合は、統合先（正）の Request に記録されます。

## Discord への同期

DB が正です。以下のステータス変更時のみ Discord に反映します（`DISCORD_SYNCED_STATUSES`）。

- Planned / In Progress / Released / Not Planned
  - Request メッセージの embed を更新
  - Thread に「Reviewing → Planned に変更されました」を投稿

「同じ要望あり」や Duplicate Merge による件数の変化は embed の更新のみ行います。
Priority などその他の管理操作は通知しません。

## 必要な Bot 権限

- `Send Messages`, `Create Public Threads`, `Send Messages in Threads`, `Read Message History`（返信のため）
- OAuth2 scope: `bot`, `applications.commands`
