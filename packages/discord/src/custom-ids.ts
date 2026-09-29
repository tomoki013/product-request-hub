/**
 * custom_id values carried by components. Keep them short (max 100 chars).
 * Only opaque IDs go in here — never trust them for authorization.
 */
const P = "prh";

export const CustomId = {
  requestModal: `${P}:req`,
  requestModalFromMessage: (messageId: string) => `${P}:req:msg:${messageId}`,
  sameRequestButton: (requestId: string) => `${P}:same:${requestId}`,
  sameRequestSourceSelect: (requestId: string) => `${P}:same_src:${requestId}`,
  fieldTitle: "title",
  fieldDescription: "description",
  fieldSource: "source",
} as const;

export type ParsedCustomId =
  | { kind: "request_modal"; sourceMessageId?: string }
  | { kind: "same_request"; requestId: string }
  | { kind: "same_request_source"; requestId: string }
  | { kind: "unknown" };

export function parseCustomId(customId: string): ParsedCustomId {
  const parts = customId.split(":");
  if (parts[0] !== P) return { kind: "unknown" };
  switch (parts[1]) {
    case "req":
      return parts[2] === "msg" && parts[3]
        ? { kind: "request_modal", sourceMessageId: parts[3] }
        : { kind: "request_modal" };
    case "same":
      return parts[2] ? { kind: "same_request", requestId: parts[2] } : { kind: "unknown" };
    case "same_src":
      return parts[2] ? { kind: "same_request_source", requestId: parts[2] } : { kind: "unknown" };
    default:
      return { kind: "unknown" };
  }
}
