"use client";

import { buttonClass, cx, inputClass } from "@prh/ui";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/api";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Form bound to a server action; shows the API error message inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state?.ok ? String(Math.random()) : undefined}
    >
      {children}
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass(variant), className)}>
      {pending ? "..." : children}
    </button>
  );
}

/** A select that saves as soon as it changes (used for inline field edits). */
export function InlineSelect({
  action,
  name,
  value,
  options,
  disabled,
  allowEmpty = true,
}: {
  action: Action;
  name: string;
  value: string | null;
  options: { value: string; label: string }[];
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-block">
      <select
        name={name}
        defaultValue={value ?? ""}
        disabled={disabled || pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cx(inputClass, "w-40 py-1 disabled:bg-slate-50 disabled:text-slate-500")}
      >
        {allowEmpty && <option value="">-</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state?.error && <p className="mt-1 max-w-40 text-left text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
