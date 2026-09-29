import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AppEnv, Bindings } from "./env";
import { AppError } from "./errors";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function verifyAccessToken(token: string, env: Bindings): Promise<JWTPayload> {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!team || !env.CF_ACCESS_AUD) throw new Error("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set");
  const url = `https://${team}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${team}`,
    audience: env.CF_ACCESS_AUD,
  });
  return payload;
}

/**
 * Authenticates the management app. Cloudflare Access signs in the user and
 * attaches a JWT (`Cf-Access-Jwt-Assertion`) that the management app forwards;
 * the email in it is matched to a registered Product Request Hub user.
 * The API itself is public (Discord calls it), so the signature is always verified.
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

  const token = c.req.header("cf-access-jwt-assertion");
  if (!token) throw new AppError("unauthorized", "Missing Cloudflare Access token");

  let payload: JWTPayload;
  try {
    payload = await verifyAccessToken(token, c.env);
  } catch {
    throw new AppError("unauthorized", "Invalid token");
  }
  // Service tokens carry no email and are not users.
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email) throw new AppError("unauthorized", "Invalid token");

  const actor = await identity.findByEmail(email);
  if (!actor) throw new AppError("forbidden", "This account is not registered in any workspace");
  c.set("actor", actor);
  return next();
});
