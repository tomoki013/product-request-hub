import "server-only";
import type { ApiErrorBody } from "@prh/shared";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, isDevAuth } from "./supabase/server";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (isDevAuth()) return { "x-dev-user-email": process.env.DEV_USER_EMAIL! };
  const supabase = await createSupabaseServerClient();
  // getUser() validates the session with Supabase before we forward the token.
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");
  return { authorization: `Bearer ${data.session.access_token}` };
}

/**
 * Calls the internal Request API. The management app never talks to the
 * database directly (design doc §19).
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${process.env.API_BASE_URL}/api${path}`, {
    method: init.method ?? "GET",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.code ?? "unknown", body?.error.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ActionState = { error?: string; ok?: boolean } | null;

/** Wraps a server action body so API errors are shown in the form instead of crashing. */
export async function runAction(fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
