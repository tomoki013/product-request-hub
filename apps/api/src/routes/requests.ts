import { zValidator } from "@hono/zod-validator";
import {
  addLinkSchema,
  addSourceSchema,
  createRequestSchema,
  listRequestsQuerySchema,
  mergeDuplicateSchema,
  updateRequestSchema,
  webOriginSchema,
} from "@prh/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { validationHook } from "./validation";

/** Web clients may only file requests through the web origin. */
const webCreateSchema = createRequestSchema.extend({ origin: webOriginSchema });

export const requestRoutes = new Hono<AppEnv>()
  .post("/", zValidator("json", webCreateSchema, validationHook), async (c) => {
    const { request } = await c.get("services").requests.create(c.get("actor"), c.req.valid("json"));
    return c.json(request, 201);
  })
  .get("/", zValidator("query", listRequestsQuerySchema, validationHook), async (c) => {
    return c.json(await c.get("services").requests.list(c.get("actor"), c.req.valid("query")));
  })
  .get("/:id", async (c) => {
    return c.json(await c.get("services").requests.get(c.get("actor"), c.req.param("id")));
  })
  .patch("/:id", zValidator("json", updateRequestSchema, validationHook), async (c) => {
    return c.json(
      await c.get("services").requests.update(c.get("actor"), c.req.param("id"), c.req.valid("json")),
    );
  })
  .get("/:id/events", async (c) => {
    return c.json({ items: await c.get("services").requests.events(c.get("actor"), c.req.param("id")) });
  })
  .post("/:id/sources", zValidator("json", addSourceSchema, validationHook), async (c) => {
    return c.json(
      await c.get("services").requests.addSource(c.get("actor"), c.req.param("id"), c.req.valid("json")),
      201,
    );
  })
  .post("/:id/merge", zValidator("json", mergeDuplicateSchema, validationHook), async (c) => {
    const { duplicateOfId } = c.req.valid("json");
    return c.json(
      await c.get("services").requests.mergeDuplicate(c.get("actor"), c.req.param("id"), duplicateOfId),
    );
  })
  .post("/:id/links", zValidator("json", addLinkSchema, validationHook), async (c) => {
    return c.json(
      await c.get("services").requests.addLink(c.get("actor"), c.req.param("id"), c.req.valid("json")),
      201,
    );
  })
  .delete(
    "/:id/links/:linkId",
    zValidator("param", z.object({ id: z.string(), linkId: z.uuid() }), validationHook),
    async (c) => {
      const { id, linkId } = c.req.valid("param");
      return c.json(await c.get("services").requests.removeLink(c.get("actor"), id, linkId));
    },
  );
