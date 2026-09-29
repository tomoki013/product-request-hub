import type {
  Level,
  OriginProvider,
  Priority,
  RequestEventType,
  RequestLinkType,
  RequestSourceType,
  RequestStatus,
  UserRole,
} from "./constants";

/** API response shapes shared by the API and the management app. */

export interface UserSummary {
  id: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
}

export interface RequestListItem {
  id: string;
  requestNumber: number;
  key: string; // "REQ-0023"
  title: string;
  status: RequestStatus;
  priority: Priority | null;
  project: ProjectSummary;
  assignee: UserSummary | null;
  requestCount: number;
  duplicateOf: { id: string; key: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestSourceBreakdown {
  sourceType: RequestSourceType | "unspecified";
  count: number;
}

export interface RequestOriginView {
  provider: OriginProvider;
  externalChannelId: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown>;
}

export interface RequestLinkView {
  id: string;
  linkType: RequestLinkType;
  url: string;
  label: string | null;
  createdAt: string;
}

export interface RequestDetail extends RequestListItem {
  description: string;
  impact: Level | null;
  effort: Level | null;
  requester: UserSummary | null;
  targetRelease: { id: string; name: string } | null;
  sourceProvider: OriginProvider;
  sources: RequestSourceBreakdown[];
  origins: RequestOriginView[];
  links: RequestLinkView[];
  duplicates: { id: string; key: string; title: string }[];
  releasedAt: string | null;
}

export interface RequestEventView {
  id: string;
  eventType: RequestEventType;
  actor: UserSummary | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Me {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  workspace: { id: string; name: string; slug: string };
  permissions: string[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
