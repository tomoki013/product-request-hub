import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AppEnv, Bindings } from "./env";
import { AppError } from "./errors";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function verifySupabaseToken(token: string, env: Bindings): Promise<JWTPayload> {
  if (env.SUPABASE_JWT_SECRET) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), {
      audience: "authenticated",
    });
    return payload;
  }
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL or SUPABASE_JWT_SECRET must be set");
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, { audience: "authenticated" });
  return payload;
}

/**
 * Authenticates the management app. Tokens are Supabase Auth access tokens;
 * the auth user is linked to a Product Request Hub user by email.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const identity = c.get("services").identity;

  const devEmail = c.req.header("x-dev-user-email");
  if (c.env.AUTH_DEV_BYPASS === "true" && devEmail) {
    const actor = await identity.findByEmail(devEmail);
    if (!actor) throw new AppError("unauthorized", "Unknown dev user");
    c.set("actor", actor);
    return next();
  }

  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError("unauthorized", "Missing bearer token");

  let payload: JWTPayload;
  try {
    payload = await verifySupabaseToken(token, c.env);
  } catch {
    throw new AppError("unauthorized", "Invalid token");
  }
  if (!payload.sub) throw new AppError("unauthorized", "Invalid token");

  const email = typeof payload.email === "string" ? payload.email : undefined;
  const actor = await identity.resolveWebUser(payload.sub, email);
  if (!actor) throw new AppError("forbidden", "This account is not registered in any workspace");
  c.set("actor", actor);
  return next();
});
