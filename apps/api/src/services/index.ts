import type { Database } from "@prh/database";
import { AdminService } from "./admin";
import { IdentityService } from "./identity";
import type { RequestNotifier } from "./notifier";
import { RequestService } from "./requests";

export interface Services {
  requests: RequestService;
  identity: IdentityService;
  admin: AdminService;
}

export function createServices(db: Database, notifier: RequestNotifier): Services {
  return {
    requests: new RequestService(db, notifier),
    identity: new IdentityService(db),
    admin: new AdminService(db),
  };
}

export type { Actor } from "./actor";
export { AdminService, IdentityService, RequestService };
