"use server";

import type { RequestDetail } from "@prh/shared";
import { redirect } from "next/navigation";
import { api, ApiError, type ActionState } from "@/lib/api";
import { formValue } from "@/lib/format";

export async function createRequest(_: ActionState, form: FormData): Promise<ActionState> {
  let key: string;
  try {
    const created = await api<RequestDetail>("/requests", {
      method: "POST",
      body: {
        title: formValue(form, "title"),
        description: formValue(form, "description"),
        sourceType: formValue(form, "sourceType") ?? undefined,
        origin: { provider: "web", projectId: formValue(form, "projectId") },
      },
    });
    key = created.key;
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  redirect(`/requests/${key}`);
}
