import {
  DESCRIPTION_MAX,
  REQUEST_SOURCE_LABELS,
  REQUEST_SOURCE_TYPES,
  TITLE_MAX,
  type ProjectSummary,
} from "@prh/shared";
import { Card, inputClass } from "@prh/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { api } from "@/lib/api";
import { createRequest } from "./actions";

export default async function NewRequestPage() {
  const projects = await api<{ items: (ProjectSummary & { isActive: boolean })[] }>("/projects");
  const active = projects.items.filter((p) => p.isActive);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">機能要望を登録</h1>
      <Card>
        <ActionForm action={createRequest} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">タイトル</span>
            <input name="title" required maxLength={TITLE_MAX} className={`${inputClass} w-full`} placeholder="店舗をお気に入り保存したい" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">内容</span>
            <textarea name="description" required maxLength={DESCRIPTION_MAX} rows={6} className={`${inputClass} w-full`} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Project</span>
              <select name="projectId" required className={`${inputClass} w-full`} defaultValue={active[0]?.id}>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">要望元</span>
              <select name="sourceType" className={`${inputClass} w-full`} defaultValue="">
                <option value="">-</option>
                {REQUEST_SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {REQUEST_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SubmitButton>登録</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
