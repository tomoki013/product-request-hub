/**
 * Minimal subset of the Discord interaction payloads this app relies on.
 * https://discord.com/developers/docs/interactions/receiving-and-responding
 */

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ApplicationCommandAutocomplete: 4,
  ModalSubmit: 5,
} as const;

export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
  Modal: 9,
} as const;

export const ApplicationCommandType = {
  ChatInput: 1,
  User: 2,
  Message: 3,
} as const;

export const ComponentType = {
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  TextInput: 4,
  Label: 18,
} as const;

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
  Link: 5,
} as const;

export const TextInputStyle = {
  Short: 1,
  Paragraph: 2,
} as const;

export const MessageFlags = {
  Ephemeral: 1 << 6,
} as const;

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface DiscordMember {
  user: DiscordUser;
  nick?: string | null;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  author: DiscordUser;
}

export interface SubmittedComponent {
  type: number;
  custom_id?: string;
  value?: string;
  values?: string[];
  components?: SubmittedComponent[];
  component?: SubmittedComponent;
}

export interface Interaction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordMember;
  user?: DiscordUser;
  message?: DiscordMessage;
  data?: {
    id?: string;
    name?: string;
    type?: number;
    target_id?: string;
    custom_id?: string;
    component_type?: number;
    values?: string[];
    resolved?: { messages?: Record<string, DiscordMessage> };
    components?: SubmittedComponent[];
  };
}

export interface InteractionResponse {
  type: number;
  data?: Record<string, unknown>;
}
