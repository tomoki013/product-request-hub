import { zValidator } from "@hono/zod-validator";
import {
  createChannelMappingSchema,
  createDiscordIntegrationSchema,
  createProjectSchema,
  createReleaseSchema,
  createUserSchema,
  updateChannelMappingSchema,
  updateProjectSchema,
  updateUserSchema,
} from "@prh/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { validationHook } from "./validation";

export const adminRoutes = new Hono<AppEnv>()
  .get("/me", async (c) => c.json(await c.get("services").identity.me(c.get("actor"))))

  .get("/projects", async (c) => c.json({ items: await c.get("services").admin.listProjects(c.get("actor")) }))
  .post("/projects", zValidator("json", createProjectSchema, validationHook), async (c) =>
    c.json(await c.get("services").admin.createProject(c.get("actor"), c.req.valid("json")), 201),
  )
  .patch("/projects/:id", zValidator("json", updateProjectSchema, validationHook), async (c) =>
    c.json(
      await c.get("services").admin.updateProject(c.get("actor"), c.req.param("id"), c.req.valid("json")),
    ),
  )

  .get(
    "/releases",
    zValidator("query", z.object({ projectId: z.uuid().optional() }), validationHook),
    async (c) =>
      c.json({
        items: await c.get("services").admin.listReleases(c.get("actor"), c.req.valid("query").projectId),
      }),
  )
  .post("/releases", zValidator("json", createReleaseSchema, validationHook), async (c) =>
    c.json(await c.get("services").admin.createRelease(c.get("actor"), c.req.valid("json")), 201),
  )

  .get("/discord/integrations", async (c) =>
    c.json({ items: await c.get("services").admin.listDiscordIntegrations(c.get("actor")) }),
  )
  .post(
    "/discord/integrations",
    zValidator("json", createDiscordIntegrationSchema, validationHook),
    async (c) =>
      c.json(await c.get("services").admin.createDiscordIntegration(c.get("actor"), c.req.valid("json")), 201),
  )
  .get("/channel-mappings", async (c) =>
    c.json({ items: await c.get("services").admin.listChannelMappings(c.get("actor")) }),
  )
  .post("/channel-mappings", zValidator("json", createChannelMappingSchema, validationHook), async (c) =>
    c.json(await c.get("services").admin.createChannelMapping(c.get("actor"), c.req.valid("json")), 201),
  )
  .patch(
    "/channel-mappings/:id",
    zValidator("json", updateChannelMappingSchema, validationHook),
    async (c) =>
      c.json(
        await c
          .get("services")
          .admin.updateChannelMapping(c.get("actor"), c.req.param("id"), c.req.valid("json")),
      ),
  )
  .delete("/channel-mappings/:id", async (c) => {
    await c.get("services").admin.deleteChannelMapping(c.get("actor"), c.req.param("id"));
    return c.body(null, 204);
  })

  .get("/users", async (c) => c.json({ items: await c.get("services").admin.listUsers(c.get("actor")) }))
  .post("/users", zValidator("json", createUserSchema, validationHook), async (c) =>
    c.json(await c.get("services").admin.createUser(c.get("actor"), c.req.valid("json")), 201),
  )
  .patch("/users/:id", zValidator("json", updateUserSchema, validationHook), async (c) =>
    c.json(await c.get("services").admin.updateUser(c.get("actor"), c.req.param("id"), c.req.valid("json"))),
  );
