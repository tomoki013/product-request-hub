import { hasPermission, type Permission, type UserRole } from "@prh/shared";
import { forbidden } from "../errors";

/** The authenticated user a service call is performed on behalf of. */
export interface Actor {
  userId: string;
  workspaceId: string;
  role: UserRole;
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor.role, permission)) throw forbidden(`Missing permission: ${permission}`);
}
