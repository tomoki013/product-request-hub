import {
  REQUEST_SOURCE_LABELS,
  REQUEST_SOURCE_TYPES,
  REQUEST_STATUS_LABELS,
  TITLE_MAX,
  type RequestSourceType,
  type RequestStatus,
} from "@prh/shared";
import { CustomId } from "./custom-ids";
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
  type InteractionResponse,
  type SubmittedComponent,
} from "./types";

/** Discord modal text input max length. */
const MODAL_DESCRIPTION_MAX = 4000;

const STATUS_COLORS: Record<RequestStatus, number> = {
  new: 0x5865f2,
  reviewing: 0xfee75c,
  backlog: 0x99aab5,
  planned: 0x3498db,
  in_progress: 0xe67e22,
  released: 0x57f287,
  not_planned: 0x4f545c,
};

function sourceOptions() {
  return REQUEST_SOURCE_TYPES.map((value) => ({ label: REQUEST_SOURCE_LABELS[value], value }));
}

/**
 * "機能要望を登録" modal (design doc §7). Project is intentionally absent:
 * it is resolved from the channel mapping on the server.
 */
export function requestModal(options: { customId: string; description?: string }): InteractionResponse {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: options.customId,
      title: "機能要望を登録",
      components: [
        {
          type: ComponentType.Label,
          label: "タイトル",
          description: "機能要望の概要（例: 店舗をお気に入り保存したい）",
          component: {
            type: ComponentType.TextInput,
            custom_id: CustomId.fieldTitle,
            style: TextInputStyle.Short,
            required: true,
            max_length: TITLE_MAX,
          },
        },
        {
          type: ComponentType.Label,
          label: "内容",
          description: "背景・要望内容",
          component: {
            type: ComponentType.TextInput,
            custom_id: CustomId.fieldDescription,
            style: TextInputStyle.Paragraph,
            required: true,
            max_length: MODAL_DESCRIPTION_MAX,
            ...(options.description
              ? { value: options.description.slice(0, MODAL_DESCRIPTION_MAX) }
              : {}),
          },
        },
        {
          type: ComponentType.Label,
          label: "要望元",
          component: {
            type: ComponentType.StringSelect,
            custom_id: CustomId.fieldSource,
            required: false,
            min_values: 0,
            max_values: 1,
            placeholder: "選択してください（任意）",
            options: sourceOptions(),
          },
        },
      ],
    },
  };
}

/** Flattens both the legacy (action row) and Label-based modal submit shapes. */
export function readModalValues(components: SubmittedComponent[] = []): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const visit = (c: SubmittedComponent) => {
    if (c.custom_id) {
      if (c.values) out[c.custom_id] = c.values;
      else if (c.value !== undefined) out[c.custom_id] = [c.value];
    }
    c.components?.forEach(visit);
    if (c.component) visit(c.component);
  };
  components.forEach(visit);
  return out;
}

export interface RequestMessageView {
  requestId: string;
  key: string;
  title: string;
  status: RequestStatus;
  projectName: string;
  requesterDiscordId: string | null;
  requesterName: string | null;
  requestCount: number;
  detailUrl: string;
}

/** Bot message posted when a request is created (design doc §11). */
export function requestMessage(view: RequestMessageView) {
  const requestedBy = view.requesterDiscordId
    ? `<@${view.requesterDiscordId}>`
    : (view.requesterName ?? "-");
  return {
    embeds: [
      {
        title: `🎫 ${view.key}`,
        description: view.title,
        url: view.detailUrl,
        color: STATUS_COLORS[view.status],
        fields: [
          { name: "Status", value: REQUEST_STATUS_LABELS[view.status], inline: true },
          { name: "Project", value: view.projectName, inline: true },
          { name: "Requests", value: String(view.requestCount), inline: true },
          { name: "Requested by", value: requestedBy, inline: false },
        ],
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          { type: ComponentType.Button, style: ButtonStyle.Link, label: "詳細を見る", url: view.detailUrl },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: "同じ要望あり",
            emoji: { name: "🙋" },
            custom_id: CustomId.sameRequestButton(view.requestId),
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

export function threadName(key: string, title: string): string {
  return `${key} ${title}`.slice(0, 100);
}

/** Ephemeral prompt shown after clicking "同じ要望あり". */
export function sameRequestSourcePrompt(requestId: string, key: string): InteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `**${key}** に同じ要望を追加します。要望元を選択してください。`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: CustomId.sameRequestSourceSelect(requestId),
              placeholder: "要望元",
              min_values: 1,
              max_values: 1,
              options: sourceOptions(),
            },
          ],
        },
      ],
    },
  };
}

export function ephemeral(content: string): InteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral, content, allowed_mentions: { parse: [] } },
  };
}

export function updateMessage(content: string): InteractionResponse {
  return {
    type: InteractionResponseType.UpdateMessage,
    data: { content, components: [], allowed_mentions: { parse: [] } },
  };
}

export function deferredEphemeral(): InteractionResponse {
  return {
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  };
}

export function statusChangeNotice(key: string, from: RequestStatus, to: RequestStatus): string {
  const emoji: Partial<Record<RequestStatus, string>> = {
    planned: "📅",
    in_progress: "🛠️",
    released: "🚀",
    not_planned: "🗂️",
  };
  return `${emoji[to] ?? "🔄"} **${key}** のステータスが **${REQUEST_STATUS_LABELS[from]} → ${REQUEST_STATUS_LABELS[to]}** に変更されました。`;
}

export function isSourceType(value: string | undefined): value is RequestSourceType {
  return !!value && (REQUEST_SOURCE_TYPES as readonly string[]).includes(value);
}
