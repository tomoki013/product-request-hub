import type { RequestStatus, UserRole } from "./constants";

export const PERMISSIONS = [
  "request:create",
  "request:add_source",
  "request:read",
  "request:update_status",
  "request:assign",
  "request:set_effort",
  "request:link_development",
  "request:set_priority",
  "request:set_impact",
  "request:set_target_release",
  "request:decide", // Planned / Not Planned
  "request:merge_duplicate",
  "admin:workspace",
  "admin:projects",
  "admin:discord",
  "admin:users",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const REQUESTER: Permission[] = ["request:create", "request:add_source", "request:read"];

const DEVELOPER: Permission[] = [
  ...REQUESTER,
  "request:update_status",
  "request:assign",
  "request:set_effort",
  "request:link_development",
];

const PRODUCT_MANAGER: Permission[] = [
  ...DEVELOPER,
  "request:set_priority",
  "request:set_impact",
  "request:set_target_release",
  "request:decide",
  "request:merge_duplicate",
];

const ADMIN: Permission[] = [...PERMISSIONS];

/** Role → permission matrix (design doc §35). Roles are cumulative. */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  requester: new Set(REQUESTER),
  developer: new Set(DEVELOPER),
  product_manager: new Set(PRODUCT_MANAGER),
  admin: new Set(ADMIN),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Planned / Not Planned are product decisions; other moves are developer work. */
export function statusPermission(to: RequestStatus): Permission {
  return to === "planned" || to === "not_planned" ? "request:decide" : "request:update_status";
}
