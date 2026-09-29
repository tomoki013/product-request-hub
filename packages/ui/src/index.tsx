import {
  LEVEL_LABELS,
  REQUEST_STATUS_LABELS,
  type Level,
  type Priority,
  type RequestStatus,
} from "@prh/shared";
import type { ReactNode } from "react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const STATUS_STYLES: Record<RequestStatus, string> = {
  new: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  reviewing: "bg-amber-50 text-amber-800 ring-amber-600/20",
  backlog: "bg-slate-100 text-slate-700 ring-slate-500/20",
  planned: "bg-sky-50 text-sky-700 ring-sky-600/20",
  in_progress: "bg-orange-50 text-orange-700 ring-orange-600/20",
  released: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  not_planned: "bg-zinc-100 text-zinc-500 ring-zinc-500/20",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-500/20",
  medium: "bg-blue-50 text-blue-700 ring-blue-600/20",
  high: "bg-orange-50 text-orange-700 ring-orange-600/20",
  urgent: "bg-red-50 text-red-700 ring-red-600/20",
};

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        className ?? "bg-slate-100 text-slate-700 ring-slate-500/20",
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{REQUEST_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority | Level | null }) {
  if (!priority) return <span className="text-slate-400">-</span>;
  return (
    <Badge className={PRIORITY_STYLES[priority as Priority] ?? PRIORITY_STYLES.low}>
      {LEVEL_LABELS[priority]}
    </Badge>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-slate-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{children}</dd>
    </div>
  );
}

export const buttonClass = (variant: "primary" | "secondary" | "danger" = "secondary") =>
  cx(
    "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium shadow-xs transition disabled:opacity-50",
    variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-500",
    variant === "secondary" && "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    variant === "danger" && "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  );

export const inputClass =
  "block rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none";

export { cx };
