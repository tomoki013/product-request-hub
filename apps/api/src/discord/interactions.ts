import {
  ApplicationCommandType,
  CustomId,
  deferredEphemeral,
  DiscordRest,
  ephemeral,
  InteractionResponseType,
  InteractionType,
  isSourceType,
  MESSAGE_COMMAND_NAME,
  messageUrl,
  parseCustomId,
  readModalValues,
  REQUEST_COMMAND_NAME,
  requestModal,
  sameRequestSourcePrompt,
  threadName,
  type Interaction,
  type InteractionResponse,
} from "@prh/discord";
import { REQUEST_SOURCE_LABELS, type RequestSourceType } from "@prh/shared";
import { AppError } from "../errors";
import type { Services } from "../services";
import type { Actor } from "../services/actor";
import type { DiscordSync } from "./sync";

export interface InteractionDeps {
  services: Services;
  rest: DiscordRest;
  sync: DiscordSync;
  defer: (task: Promise<unknown>) => void;
}

const NOT_MAPPED =
  "このチャンネルは機能要望の登録先として設定されていません。管理画面の Channel Mapping を確認してください。";

/**
 * Discord → Request API adapter. It translates interactions into service
 * calls; it never touches the database directly (design doc §19, §42-6).
 */
export async function handleInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<InteractionResponse> {
  switch (interaction.type) {
    case InteractionType.Ping:
      return { type: InteractionResponseType.Pong };
    case InteractionType.ApplicationCommand:
      return handleCommand(interaction, deps);
    case InteractionType.ModalSubmit:
      return handleModalSubmit(interaction, deps);
    case InteractionType.MessageComponent:
      return handleComponent(interaction, deps);
    default:
      return ephemeral("未対応の操作です。");
  }
}

function discordUser(interaction: Interaction) {
  const user = interaction.member?.user ?? interaction.user;
  if (!user) throw new AppError("bad_request", "Interaction without user");
  const name = interaction.member?.nick ?? user.global_name ?? user.username;
  return { id: user.id, name };
}

/** Resolves the channel's workspace, then the (auto-provisioned) Discord user in it. */
async function resolveActor(interaction: Interaction, deps: InteractionDeps): Promise<Actor | null> {
  if (!interaction.guild_id || !interaction.channel_id) return null;
  const mapping = await deps.services.requests.discordMapping(
    interaction.guild_id,
    interaction.channel_id,
  );
  if (!mapping) return null;
  return deps.services.identity.resolveDiscordUser(mapping.workspaceId, discordUser(interaction));
}

async function handleCommand(interaction: Interaction, deps: InteractionDeps) {
  const data = interaction.data;
  if (!interaction.guild_id || !interaction.channel_id) return ephemeral("サーバー内で実行してください。");

  const mapping = await deps.services.requests.discordMapping(interaction.guild_id, interaction.channel_id);
  if (!mapping) return ephemeral(NOT_MAPPED);

  if (data?.type === ApplicationCommandType.ChatInput && data.name === REQUEST_COMMAND_NAME) {
    return requestModal({ customId: CustomId.requestModal });
  }

  if (data?.type === ApplicationCommandType.Message && data.name === MESSAGE_COMMAND_NAME) {
    const message = data.target_id ? data.resolved?.messages?.[data.target_id] : undefined;
    if (!message) return ephemeral("メッセージを取得できませんでした。");
    const author = message.author.global_name ?? message.author.username;
    const description = message.content
      ? `${message.content}\n\n— ${author} のメッセージより`
      : `${author} のメッセージより`;
    return requestModal({
      customId: CustomId.requestModalFromMessage(message.id),
      description,
    });
  }

  return ephemeral("未対応のコマンドです。");
}

async function handleModalSubmit(interaction: Interaction, deps: InteractionDeps) {
  const parsed = parseCustomId(interaction.data?.custom_id ?? "");
  if (parsed.kind !== "request_modal") return ephemeral("未対応の操作です。");

  const values = readModalValues(interaction.data?.components);
  const title = values[CustomId.fieldTitle]?.[0] ?? "";
  const description = values[CustomId.fieldDescription]?.[0] ?? "";
  const source = values[CustomId.fieldSource]?.[0];

  // Creating the request, posting the message and opening the thread can take
  // longer than Discord's 3s deadline, so acknowledge first.
  deps.defer(
    createFromModal(interaction, deps, {
      title,
      description,
      sourceType: isSourceType(source) ? source : undefined,
      sourceMessageId: parsed.sourceMessageId,
    }).catch(async (e) => {
      console.error("request creation failed", e);
      await deps.rest
        .editOriginalResponse(interaction.token, { content: errorMessage(e) })
        .catch(() => {});
    }),
  );
  return deferredEphemeral();
}

async function createFromModal(
  interaction: Interaction,
  deps: InteractionDeps,
  input: {
    title: string;
    description: string;
    sourceType?: RequestSourceType;
    sourceMessageId?: string;
  },
) {
  const guildId = interaction.guild_id!;
  const channelId = interaction.channel_id!;
  const actor = await resolveActor(interaction, deps);
  if (!actor) throw new AppError("channel_not_mapped", NOT_MAPPED);
  const user = discordUser(interaction);

  const { request, originId } = await deps.services.requests.create(
    actor,
    {
      title: input.title,
      description: input.description,
      sourceType: input.sourceType,
      origin: {
        provider: "discord",
        guildId,
        channelId,
        ...(input.sourceMessageId
          ? {
              sourceMessageId: input.sourceMessageId,
              sourceMessageUrl: messageUrl(guildId, channelId, input.sourceMessageId),
            }
          : {}),
      },
    },
    { externalUserId: user.id, metadata: { discordUsername: user.name } },
  );

  const message = await deps.rest.createMessage(channelId, {
    ...(await deps.sync.render(request)),
    ...(input.sourceMessageId
      ? { message_reference: { message_id: input.sourceMessageId, fail_if_not_exists: false } }
      : {}),
  });
  const thread = await deps.rest
    .startThreadFromMessage(channelId, message.id, threadName(request.key, request.title))
    .catch((e) => {
      console.error("thread creation failed", e);
      return null;
    });
  await deps.services.requests.attachOriginMessage(originId, {
    messageId: message.id,
    threadId: thread?.id ?? null,
    url: messageUrl(guildId, channelId, message.id),
  });

  await deps.rest.editOriginalResponse(interaction.token, {
    content: `✅ **${request.key}** を登録しました。詳細な議論はスレッドでどうぞ。`,
  });
}

async function handleComponent(interaction: Interaction, deps: InteractionDeps) {
  const parsed = parseCustomId(interaction.data?.custom_id ?? "");

  if (parsed.kind === "same_request") {
    const actor = await resolveActor(interaction, deps);
    if (!actor) return ephemeral(NOT_MAPPED);
    const request = await deps.services.requests.get(actor, parsed.requestId).catch(() => null);
    if (!request) return ephemeral("Requestが見つかりませんでした。");
    return sameRequestSourcePrompt(request.id, request.duplicateOf?.key ?? request.key);
  }

  if (parsed.kind === "same_request_source") {
    const source = interaction.data?.values?.[0];
    if (!isSourceType(source)) return ephemeral("要望元を選択してください。");
    deps.defer(
      (async () => {
        const actor = await resolveActor(interaction, deps);
        if (!actor) throw new AppError("channel_not_mapped", NOT_MAPPED);
        const request = await deps.services.requests.addSource(
          actor,
          parsed.requestId,
          { sourceType: source },
          { externalUserId: discordUser(interaction).id },
        );
        await deps.rest.editOriginalResponse(interaction.token, {
          content: `🙋 **${request.key}** に同じ要望（${REQUEST_SOURCE_LABELS[source]}）を追加しました。Requests: **${request.requestCount}**`,
          components: [],
        });
      })().catch(async (e) => {
        console.error("add source failed", e);
        await deps.rest
          .editOriginalResponse(interaction.token, { content: errorMessage(e), components: [] })
          .catch(() => {});
      }),
    );
    return { type: InteractionResponseType.DeferredUpdateMessage };
  }

  return ephemeral("未対応の操作です。");
}

function errorMessage(e: unknown): string {
  if (e instanceof AppError) {
    if (e.code === "channel_not_mapped") return NOT_MAPPED;
    if (e.code === "forbidden") return "この操作を行う権限がありません。";
    if (e.code === "bad_request") return `入力内容を確認してください: ${e.message}`;
  }
  return "⚠️ 処理に失敗しました。時間をおいて再度お試しください。";
}
