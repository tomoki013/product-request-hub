import type { RequestDetail, RequestStatus } from "@prh/shared";

export type RequestNotification =
  | { kind: "status_changed"; request: RequestDetail; from: RequestStatus; to: RequestStatus }
  | { kind: "source_added"; request: RequestDetail };

/**
 * Outbound side effects of request changes (Discord today, Slack later).
 * `notify` must not throw and must not block the API response.
 */
export interface RequestNotifier {
  notify(notification: RequestNotification): void;
}

export const noopNotifier: RequestNotifier = { notify() {} };

export class CompositeNotifier implements RequestNotifier {
  constructor(private readonly notifiers: RequestNotifier[]) {}
  notify(n: RequestNotification): void {
    for (const notifier of this.notifiers) notifier.notify(n);
  }
}
