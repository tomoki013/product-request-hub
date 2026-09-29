"use server";

import { revalidatePath } from "next/cache";
import { api, runAction, type ActionState } from "@/lib/api";
import { formValue } from "@/lib/format";

async function run(path: string, fn: () => Promise<unknown>): Promise<ActionState> {
  const result = await runAction(fn);
  revalidatePath(path);
  return result;
}

// Projects & releases

export async function createProject(_: ActionState, form: FormData) {
  return run("/settings/projects", () =>
    api("/projects", { method: "POST", body: { name: formValue(form, "name"), slug: formValue(form, "slug") } }),
  );
}

export async function updateProject(id: string, _: ActionState, form: FormData) {
  return run("/settings/projects", () =>
    api(`/projects/${id}`, {
      method: "PATCH",
      body: { name: formValue(form, "name"), isActive: form.get("isActive") === "on" },
    }),
  );
}

export async function createRelease(projectId: string, _: ActionState, form: FormData) {
  return run("/settings/projects", () =>
    api("/releases", { method: "POST", body: { projectId, name: formValue(form, "name") } }),
  );
}

// Discord

export async function createIntegration(_: ActionState, form: FormData) {
  return run("/settings/discord", () =>
    api("/discord/integrations", {
      method: "POST",
      body: { discordGuildId: formValue(form, "discordGuildId"), name: formValue(form, "name") ?? undefined },
    }),
  );
}

export async function createMapping(_: ActionState, form: FormData) {
  return run("/settings/discord", () =>
    api("/channel-mappings", {
      method: "POST",
      body: {
        discordGuildId: formValue(form, "discordGuildId"),
        discordChannelId: formValue(form, "discordChannelId"),
        projectId: formValue(form, "projectId"),
        requestEnabled: true,
      },
    }),
  );
}

export async function updateMapping(id: string, _: ActionState, form: FormData) {
  return run("/settings/discord", () =>
    api(`/channel-mappings/${id}`, {
      method: "PATCH",
      body: { projectId: formValue(form, "projectId"), requestEnabled: form.get("requestEnabled") === "on" },
    }),
  );
}

export async function deleteMapping(id: string, _: ActionState) {
  return run("/settings/discord", () => api(`/channel-mappings/${id}`, { method: "DELETE" }));
}

// Users

export async function createUser(_: ActionState, form: FormData) {
  return run("/settings/users", () =>
    api("/users", {
      method: "POST",
      body: { name: formValue(form, "name"), email: formValue(form, "email"), role: formValue(form, "role") },
    }),
  );
}

export async function updateUserRole(id: string, _: ActionState, form: FormData) {
  return run("/settings/users", () =>
    api(`/users/${id}`, { method: "PATCH", body: { role: formValue(form, "role") } }),
  );
}
