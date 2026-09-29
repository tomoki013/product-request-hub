import type { RequestStatus } from "./constants";

/**
 * Allowed status transitions (design doc §13).
 *
 * New → Reviewing → {Backlog, Planned, Not Planned}
 * Planned → In Progress → Released
 *
 * Moving "backwards" (e.g. Planned → Backlog) is allowed so the product
 * side can re-plan, but Released is terminal except for re-opening to Reviewing.
 */
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ["reviewing", "backlog", "planned", "not_planned"],
  reviewing: ["backlog", "planned", "not_planned"],
  backlog: ["reviewing", "planned", "not_planned"],
  planned: ["backlog", "in_progress", "not_planned"],
  in_progress: ["planned", "released"],
  released: ["reviewing"],
  not_planned: ["reviewing", "backlog"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: RequestStatus): readonly RequestStatus[] {
  return TRANSITIONS[from];
}
