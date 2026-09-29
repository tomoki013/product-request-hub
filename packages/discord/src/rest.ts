const API = "https://discord.com/api/v10";

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    path: string,
  ) {
    super(`Discord API ${status} on ${path}: ${body}`);
  }
}

export interface DiscordRestOptions {
  botToken: string;
  applicationId: string;
  fetch?: typeof fetch;
}

/** Thin Discord REST client. Only the endpoints this app needs. */
export class DiscordRest {
  private readonly f: typeof fetch;

  constructor(private readonly options: DiscordRestOptions) {
    this.f = options.fetch ?? fetch.bind(globalThis);
  }

  private async call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const res = await this.f(`${API}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bot ${this.options.botToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new DiscordApiError(res.status, await res.text(), path);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  createMessage(channelId: string, body: unknown) {
    return this.call<{ id: string; channel_id: string }>("POST", `/channels/${channelId}/messages`, body);
  }

  editMessage(channelId: string, messageId: string, body: unknown) {
    return this.call<{ id: string }>("PATCH", `/channels/${channelId}/messages/${messageId}`, body);
  }

  startThreadFromMessage(channelId: string, messageId: string, name: string) {
    return this.call<{ id: string }>("POST", `/channels/${channelId}/messages/${messageId}/threads`, {
      name,
      auto_archive_duration: 10080,
    });
  }

  /** Edits the deferred response of an interaction (no bot auth; the token is the credential). */
  editOriginalResponse(interactionToken: string, body: unknown) {
    return this.call<{ id: string }>(
      "PATCH",
      `/webhooks/${this.options.applicationId}/${interactionToken}/messages/@original`,
      body,
      false,
    );
  }

  bulkOverwriteCommands(commands: unknown, guildId?: string) {
    const path = guildId
      ? `/applications/${this.options.applicationId}/guilds/${guildId}/commands`
      : `/applications/${this.options.applicationId}/commands`;
    return this.call<unknown[]>("PUT", path, commands);
  }
}

export function messageUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
