import {
  LEVEL_LABELS,
  PRIORITIES,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  type ProjectSummary,
  type RequestListItem,
  type UserSummary,
} from "@prh/shared";
import { buttonClass, cx, inputClass, PriorityBadge, StatusBadge } from "@prh/ui";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 50;

type Search = {
  status?: string;
  projectId?: string;
  priority?: string;
  assigneeId?: string;
  q?: string;
  page?: string;
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const query = new URLSearchParams();
  for (const key of ["status", "projectId", "priority", "assigneeId", "q"] as const) {
    if (sp[key]) query.set(key, sp[key]);
  }
  query.set("limit", String(PAGE_SIZE));
  query.set("offset", String((page - 1) * PAGE_SIZE));

  const [list, projects, users] = await Promise.all([
    api<{ items: RequestListItem[]; total: number }>(`/requests?${query}`),
    api<{ items: (ProjectSummary & { isActive: boolean })[] }>("/projects"),
    api<{ items: UserSummary[] }>("/users"),
  ]);

  const tabHref = (status?: string) => {
    const p = new URLSearchParams(query);
    p.delete("limit");
    p.delete("offset");
    if (status) p.set("status", status);
    else p.delete("status");
    return `/requests?${p}`;
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams(query);
    p.delete("limit");
    p.delete("offset");
    p.set("page", String(n));
    return `/requests?${p}`;
  };
  const lastPage = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Requests</h1>
        <Link href="/requests/new" className={buttonClass("primary")}>
          新規Request
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {[undefined, ...REQUEST_STATUSES].map((status) => {
          const active = (sp.status ?? undefined) === status;
          return (
            <Link
              key={status ?? "all"}
              href={tabHref(status)}
              className={cx(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-indigo-600 font-medium text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {status ? REQUEST_STATUS_LABELS[status] : "All"}
            </Link>
          );
        })}
      </nav>

      <form className="flex flex-wrap items-end gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="REQ-0023 / キーワード" className={cx(inputClass, "w-56")} />
        <select name="projectId" defaultValue={sp.projectId ?? ""} className={cx(inputClass, "w-40")}>
          <option value="">全Project</option>
          {projects.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} className={cx(inputClass, "w-36")}>
          <option value="">全Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {LEVEL_LABELS[p]}
            </option>
          ))}
        </select>
        <select name="assigneeId" defaultValue={sp.assigneeId ?? ""} className={cx(inputClass, "w-40")}>
          <option value="">全Assignee</option>
          {users.items.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button className={buttonClass()}>絞り込み</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Requestはありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.items.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.key}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{r.key}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.project.name} · {formatDate(r.createdAt)}
                      {r.assignee && ` · ${r.assignee.name}`}
                    </p>
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm text-slate-600">
                    Requests <span className="font-semibold text-slate-900">{r.requestCount}</span>
                  </span>
                  <span className="w-20 shrink-0 text-right">
                    <PriorityBadge priority={r.priority} />
                  </span>
                  <span className="w-24 shrink-0 text-right">
                    <StatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {list.total}件中 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, list.total)}件
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className={buttonClass()}>
                前へ
              </Link>
            )}
            {page < lastPage && (
              <Link href={pageHref(page + 1)} className={buttonClass()}>
                次へ
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
