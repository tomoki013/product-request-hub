"use server";

import { revalidatePath } from "next/cache";
import { api, runAction, type ActionState } from "@/lib/api";
import { formValue } from "@/lib/format";

const FIELDS = ["status", "priority", "impact", "effort", "assigneeId", "targetReleaseId"] as const;
type Field = (typeof FIELDS)[number];

export async function updateField(
  id: string,
  key: string,
  field: Field,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!FIELDS.includes(field)) return { error: "Unknown field" };
  const value = formValue(form, field);
  const result = await runAction(() =>
    api(`/requests/${id}`, { method: "PATCH", body: { [field]: value ?? null } }),
  );
  revalidatePath(`/requests/${key}`);
  return result;
}

export async function addSource(id: string, key: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(() =>
    api(`/requests/${id}/sources`, {
      method: "POST",
      body: { sourceType: formValue(form, "sourceType"), note: formValue(form, "note") ?? undefined },
    }),
  );
  revalidatePath(`/requests/${key}`);
  return result;
}

export async function mergeDuplicate(id: string, key: string, _: ActionState, form: FormData): Promise<ActionState> {
  const target = formValue(form, "target");
  if (!target) return { error: "統合先のRequest番号を入力してください" };
  const result = await runAction(async () => {
    const canonical = await api<{ id: string }>(`/requests/${encodeURIComponent(target)}`);
    await api(`/requests/${id}/merge`, { method: "POST", body: { duplicateOfId: canonical.id } });
  });
  revalidatePath(`/requests/${key}`);
  return result;
}

export async function addLink(id: string, key: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(() =>
    api(`/requests/${id}/links`, {
      method: "POST",
      body: {
        linkType: formValue(form, "linkType"),
        url: formValue(form, "url"),
        label: formValue(form, "label") ?? undefined,
      },
    }),
  );
  revalidatePath(`/requests/${key}`);
  return result;
}

export async function removeLink(id: string, key: string, linkId: string, _: ActionState): Promise<ActionState> {
  const result = await runAction(() => api(`/requests/${id}/links/${linkId}`, { method: "DELETE" }));
  revalidatePath(`/requests/${key}`);
  return result;
}
