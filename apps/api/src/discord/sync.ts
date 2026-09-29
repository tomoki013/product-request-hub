import { DISCORD_SYNCED_STATUSES, type RequestDetail } from "@prh/shared";
import { DiscordRest, requestMessage, statusChangeNotice } from "@prh/discord";
import type { Services } from "../services";
import type { RequestNotification, RequestNotifier } from "../services/notifier";

export interface DiscordSyncOptions {
  rest: DiscordRest;
  services: () => Services;
  webBaseUrl: string;
  /** Background task runner (ExecutionContext.waitUntil on Workers). */
  defer: (task: Promise<unknown>) => void;
}

export function detailUrl(webBaseUrl: string, key: string): string {
  return `${webBaseUrl.replace(/\/$/, "")}/requests/${key}`;
}

/**
 * Mirrors request state back to Discord. The database stays the source of
 * truth; Discord only displays it (design doc §33, §34).
 */
export class DiscordSync implements RequestNotifier {
  constructor(private readonly options: DiscordSyncOptions) {}

  notify(n: RequestNotification): void {
    if (n.kind === "status_changed" && !DISCORD_SYNCED_STATUSES.includes(n.to)) return;
    this.options.defer(
      this.handle(n).catch((e) => console.error("discord sync failed", n.request.key, e)),
    );
  }

  private async handle(n: RequestNotification): Promise<void> {
    const origin = await this.options.services().requests.discordOrigin(n.request.id);
    if (!origin?.externalChannelId || !origin.externalMessageId) return;

    await this.options.rest.editMessage(
      origin.externalChannelId,
      origin.externalMessageId,
      await this.render(n.request),
    );
    if (n.kind === "status_changed" && origin.externalThreadId) {
      await this.options.rest.createMessage(origin.externalThreadId, {
        content: statusChangeNotice(n.request.key, n.from, n.to),
        allowed_mentions: { parse: [] },
      });
    }
  }

  async render(request: RequestDetail) {
    const requesterDiscordId = request.requester
      ? await this.options.services().identity.discordIdOf(request.requester.id)
      : null;
    return requestMessage({
      requestId: request.id,
      key: request.key,
      title: request.title,
      status: request.status,
      projectName: request.project.name,
      requesterDiscordId,
      requesterName: request.requester?.name ?? null,
      requestCount: request.requestCount,
      detailUrl: detailUrl(this.options.webBaseUrl, request.key),
    });
  }
}
