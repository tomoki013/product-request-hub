import {
  LEVEL_LABELS,
  LEVELS,
  nextStatuses,
  PRIORITIES,
  REQUEST_EVENT_LABELS,
  REQUEST_LINK_LABELS,
  REQUEST_LINK_TYPES,
  REQUEST_SOURCE_LABELS,
  REQUEST_SOURCE_TYPES,
  REQUEST_STATUS_LABELS,
  statusPermission,
  type Me,
  type RequestDetail,
  type RequestEventView,
  type RequestLinkType,
  type UserSummary,
} from "@prh/shared";
import { Card, Field, inputClass, StatusBadge } from "@prh/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, InlineSelect, SubmitButton } from "@/components/forms";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { addLink, addSource, mergeDuplicate, removeLink, updateField } from "./actions";

export default async function RequestDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let request: RequestDetail;
  try {
    request = await api<RequestDetail>(`/requests/${encodeURIComponent(key)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [events, me, users, releases] = await Promise.all([
    api<{ items: RequestEventView[] }>(`/requests/${request.id}/events`),
    api<Me>("/me"),
    api<{ items: UserSummary[] }>("/users"),
    api<{ items: { id: string; name: string }[] }>(`/releases?projectId=${request.project.id}`),
  ]);
  const can = (p: string) => me.permissions.includes(p);
  const update = (field: Parameters<typeof updateField>[2]) => updateField.bind(null, request.id, request.key, field);
  const levelOptions = LEVELS.map((v) => ({ value: v, label: LEVEL_LABELS[v] }));
  const statusOptions = [request.status, ...nextStatuses(request.status)]
    .filter((s) => s === request.status || can(statusPermission(s)))
    .map((s) => ({ value: s, label: REQUEST_STATUS_LABELS[s] }));
  const userName = (id: string | null) => users.items.find((u) => u.id === id)?.name ?? "-";
  const discordOrigin = request.origins.find((o) => o.provider === "discord");
  const linksOf = (type: RequestLinkType) => request.links.filter((l) => l.linkType === type);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/requests" className="text-sm text-slate-500 hover:text-slate-800">
          ← Requests
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-slate-500">{request.key}</span>
          <StatusBadge status={request.status} />
          {request.duplicateOf && (
            <span className="text-sm text-slate-500">
              Duplicate of{" "}
              <Link href={`/requests/${request.duplicateOf.key}`} className="font-mono text-indigo-600 hover:underline">
                {request.duplicateOf.key}
              </Link>
            </span>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{request.title}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Description">
            <p className="text-sm whitespace-pre-wrap text-slate-700">{request.description}</p>
          </Card>

          <Card title={`Requests ${request.requestCount}`}>
            <ul className="flex flex-wrap gap-2 text-sm">
              {request.sources.map((s) => (
                <li key={s.sourceType} className="rounded-md bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                  {s.sourceType === "unspecified" ? "未指定" : REQUEST_SOURCE_LABELS[s.sourceType]}{" "}
                  <span className="font-semibold">{s.count}</span>
                </li>
              ))}
            </ul>
            {request.duplicates.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                統合済み:{" "}
                {request.duplicates.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ", "}
                    <Link href={`/requests/${d.key}`} className="font-mono text-indigo-600 hover:underline">
                      {d.key}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {can("request:add_source") && (
              <ActionForm action={addSource.bind(null, request.id, request.key)} resetOnSuccess className="mt-4 flex flex-wrap gap-2">
                <select name="sourceType" required className={`${inputClass} w-36`} defaultValue="customer">
                  {REQUEST_SOURCE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {REQUEST_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <input name="note" placeholder="メモ（任意）" className={`${inputClass} min-w-48 flex-1`} />
                <SubmitButton variant="secondary">同じ要望あり</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card title="Activity">
            <ol className="space-y-3">
              {events.items.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <time className="w-12 shrink-0 text-slate-400" title={formatDateTime(e.createdAt)}>
                    {formatDate(e.createdAt)}
                  </time>
                  <span className="text-slate-700">{describeEvent(e, request.key, userName)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Status">
            <dl>
              <Field label="Status">
                <InlineSelect
                  action={update("status")}
                  name="status"
                  value={request.status}
                  options={statusOptions}
                  allowEmpty={false}
                  disabled={statusOptions.length <= 1}
                />
              </Field>
              <Field label="Project">{request.project.name}</Field>
              <Field label="Priority">
                <InlineSelect
                  action={update("priority")}
                  name="priority"
                  value={request.priority}
                  options={PRIORITIES.map((v) => ({ value: v, label: LEVEL_LABELS[v] }))}
                  disabled={!can("request:set_priority")}
                />
              </Field>
              <Field label="Assignee">
                <InlineSelect
                  action={update("assigneeId")}
                  name="assigneeId"
                  value={request.assignee?.id ?? null}
                  options={users.items.map((u) => ({ value: u.id, label: u.name }))}
                  disabled={!can("request:assign")}
                />
              </Field>
              <Field label="Requested by">{request.requester?.name ?? "-"}</Field>
              <Field label="Created">{formatDateTime(request.createdAt)}</Field>
            </dl>
          </Card>

          <Card title="Product">
            <dl>
              <Field label="Impact">
                <InlineSelect action={update("impact")} name="impact" value={request.impact} options={levelOptions} disabled={!can("request:set_impact")} />
              </Field>
              <Field label="Effort">
                <InlineSelect action={update("effort")} name="effort" value={request.effort} options={levelOptions} disabled={!can("request:set_effort")} />
              </Field>
              <Field label="Target Release">
                <InlineSelect
                  action={update("targetReleaseId")}
                  name="targetReleaseId"
                  value={request.targetRelease?.id ?? null}
                  options={releases.items.map((r) => ({ value: r.id, label: r.name }))}
                  disabled={!can("request:set_target_release")}
                />
              </Field>
            </dl>
          </Card>

          <Card title="Source">
            <dl>
              <Field label="Provider">{request.sourceProvider === "discord" ? "Discord" : request.sourceProvider}</Field>
              {discordOrigin?.externalChannelId && (
                <Field label="Channel">
                  <span className="font-mono text-xs">#{discordOrigin.externalChannelId}</span>
                </Field>
              )}
            </dl>
            {discordOrigin?.externalUrl && (
              <a href={discordOrigin.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
                Discordで開く ↗
              </a>
            )}
          </Card>

          <Card title="Development">
            <dl>
              {REQUEST_LINK_TYPES.map((type) => (
                <Field key={type} label={REQUEST_LINK_LABELS[type]}>
                  {linksOf(type).length === 0
                    ? "-"
                    : linksOf(type).map((l) => (
                        <span key={l.id} className="ml-2 inline-flex items-center gap-1">
                          <a href={l.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                            {l.label ?? l.url.replace(/^https?:\/\//, "")}
                          </a>
                          {can("request:link_development") && (
                            <ActionForm action={removeLink.bind(null, request.id, request.key, l.id)} className="inline">
                              <button className="text-slate-400 hover:text-red-600" title="削除">
                                ×
                              </button>
                            </ActionForm>
                          )}
                        </span>
                      ))}
                </Field>
              ))}
            </dl>
            {can("request:link_development") && (
              <ActionForm action={addLink.bind(null, request.id, request.key)} resetOnSuccess className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <select name="linkType" className={`${inputClass} w-36`}>
                    {REQUEST_LINK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {REQUEST_LINK_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <input name="label" placeholder="#84" className={`${inputClass} w-full`} />
                </div>
                <div className="flex gap-2">
                  <input name="url" type="url" required placeholder="https://github.com/..." className={`${inputClass} w-full`} />
                  <SubmitButton variant="secondary">リンク</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>

          {can("request:merge_duplicate") && !request.duplicateOf && (
            <Card title="Duplicate Merge">
              <p className="mb-2 text-xs text-slate-500">
                このRequestを既存Requestの重複として統合します。このRequestは削除されず、要望数は統合先に合算されます。
              </p>
              <ActionForm action={mergeDuplicate.bind(null, request.id, request.key)} className="flex gap-2">
                <input name="target" required placeholder="REQ-0023" className={`${inputClass} w-full`} />
                <SubmitButton variant="danger">統合</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function describeEvent(e: RequestEventView, key: string, userName: (id: string | null) => string): string {
  const actor = e.actor?.name ?? "System";
  const status = (v: string | null) => (v ? (REQUEST_STATUS_LABELS[v as keyof typeof REQUEST_STATUS_LABELS] ?? v) : "-");
  const level = (v: string | null) => (v ? (LEVEL_LABELS[v as keyof typeof LEVEL_LABELS] ?? v) : "-");
  switch (e.eventType) {
    case "request_created":
      return `${actor}が${e.newValue ?? key}を作成`;
    case "request_added": {
      const source = e.newValue ? REQUEST_SOURCE_LABELS[e.newValue as keyof typeof REQUEST_SOURCE_LABELS] : "";
      return `${actor}が同じ${source ? `${source} ` : ""}Requestを追加`;
    }
    case "status_changed":
      return `${status(e.oldValue)} → ${status(e.newValue)}（${actor}）`;
    case "priority_changed":
    case "impact_changed":
    case "effort_changed":
      return `${REQUEST_EVENT_LABELS[e.eventType]}: ${level(e.oldValue)} → ${level(e.newValue)}（${actor}）`;
    case "assigned":
      return e.newValue ? `${actor}が${userName(e.newValue)}をアサイン` : `${actor}がアサインを解除`;
    case "duplicate_merged":
      return e.newValue ? `${actor}が${e.newValue}の重複として統合` : `${actor}が${e.oldValue}を重複として統合`;
    case "github_issue_linked":
      return `${actor}がGitHub Issue ${e.newValue}をリンク`;
    case "pull_request_linked":
      return `${actor}がPull Request ${e.newValue}をリンク`;
    case "release_linked":
      return `${actor}がRelease ${e.newValue}をリンク`;
    case "released":
      return "Released";
    default:
      return `${REQUEST_EVENT_LABELS[e.eventType]}（${actor}）`;
  }
}
