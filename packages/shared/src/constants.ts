export const REQUEST_STATUSES = [
  "new",
  "reviewing",
  "backlog",
  "planned",
  "in_progress",
  "released",
  "not_planned",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  backlog: "Backlog",
  planned: "Planned",
  in_progress: "In Progress",
  released: "Released",
  not_planned: "Not Planned",
};

/** Status changes that are mirrored back to Discord (design doc §34). */
export const DISCORD_SYNCED_STATUSES: readonly RequestStatus[] = [
  "planned",
  "in_progress",
  "released",
  "not_planned",
];

export const REQUEST_SOURCE_TYPES = [
  "customer",
  "sales",
  "management",
  "internal",
  "support",
  "developer",
  "other",
] as const;
export type RequestSourceType = (typeof REQUEST_SOURCE_TYPES)[number];

export const REQUEST_SOURCE_LABELS: Record<RequestSourceType, string> = {
  customer: "Customer",
  sales: "Sales",
  management: "Management",
  internal: "Internal",
  support: "Support",
  developer: "Developer",
  other: "Other",
};

export const LEVELS = ["low", "medium", "high"] as const;
export type Level = (typeof LEVELS)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const LEVEL_LABELS: Record<Level | Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const USER_ROLES = ["requester", "developer", "product_manager", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  requester: "Requester",
  developer: "Developer",
  product_manager: "Product Manager",
  admin: "Admin",
};

/** Input channels. The domain model never depends on a specific provider. */
export const ORIGIN_PROVIDERS = ["discord", "slack", "web", "api"] as const;
export type OriginProvider = (typeof ORIGIN_PROVIDERS)[number];

export const IDENTITY_PROVIDERS = ["discord", "github", "slack", "supabase"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const REQUEST_LINK_TYPES = ["github_issue", "github_pull_request", "release"] as const;
export type RequestLinkType = (typeof REQUEST_LINK_TYPES)[number];

export const REQUEST_LINK_LABELS: Record<RequestLinkType, string> = {
  github_issue: "GitHub Issue",
  github_pull_request: "Pull Request",
  release: "Release",
};

export const REQUEST_EVENT_TYPES = [
  "request_created",
  "request_added",
  "status_changed",
  "priority_changed",
  "impact_changed",
  "effort_changed",
  "assigned",
  "target_release_changed",
  "duplicate_merged",
  "github_issue_linked",
  "pull_request_linked",
  "release_linked",
  "released",
] as const;
export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

export const REQUEST_EVENT_LABELS: Record<RequestEventType, string> = {
  request_created: "Request Created",
  request_added: "Request Added",
  status_changed: "Status Changed",
  priority_changed: "Priority Changed",
  impact_changed: "Impact Changed",
  effort_changed: "Effort Changed",
  assigned: "Assigned",
  target_release_changed: "Target Release Changed",
  duplicate_merged: "Duplicate Merged",
  github_issue_linked: "GitHub Issue Linked",
  pull_request_linked: "Pull Request Linked",
  release_linked: "Release Linked",
  released: "Released",
};

export const LINK_EVENT_TYPES: Record<RequestLinkType, RequestEventType> = {
  github_issue: "github_issue_linked",
  github_pull_request: "pull_request_linked",
  release: "release_linked",
};
