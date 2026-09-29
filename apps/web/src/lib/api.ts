import "server-only";
import type { ApiErrorBody } from "@prh/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { isDevAuth } from "./auth";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cloudflare Access sits in front of this app and attaches a signed JWT to every
 * request. It is forwarded to the API, which verifies it and matches the email
 * to a registered user.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (isDevAuth()) return { "x-dev-user-email": process.env.DEV_USER_EMAIL! };
  const jwt = (await headers()).get("cf-access-jwt-assertion");
  if (!jwt) {
    throw new ApiError(401, "unauthorized", "Cloudflare Access のトークンがありません。Access でこのアプリを保護してください。");
  }
  return { "cf-access-jwt-assertion": jwt };
}

/** Same-account Worker calls go through the `API` service binding when deployed on Workers. */
function apiFetch(): { fetch: typeof fetch; base: string } {
  try {
    const { env } = getCloudflareContext();
    const binding = (env as { API?: { fetch: typeof fetch } }).API;
    if (binding) return { fetch: binding.fetch.bind(binding), base: "https://api.internal" };
  } catch {
    // Not running on Workers (next dev / Node): use API_BASE_URL.
  }
  return { fetch, base: process.env.API_BASE_URL ?? "" };
}

/**
 * Calls the internal Request API. The management app never talks to the
 * database directly (design doc §19).
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const target = apiFetch();
  const res = await target.fetch(`${target.base}/api${path}`, {
    method: init.method ?? "GET",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
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
