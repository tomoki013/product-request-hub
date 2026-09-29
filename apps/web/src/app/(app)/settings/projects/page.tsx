import { Card, inputClass } from "@prh/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { api } from "@/lib/api";
import { createProject, createRelease, updateProject } from "../actions";

interface Project {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export default async function ProjectsPage() {
  const [projects, releases] = await Promise.all([
    api<{ items: Project[] }>("/projects"),
    api<{ items: { id: string; projectId: string; name: string }[] }>("/releases"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Projects</h1>

      {projects.items.map((p) => (
        <Card key={p.id} title={<span>{p.name} <span className="font-mono text-xs font-normal text-slate-400">{p.slug}</span></span>}>
          <ActionForm action={updateProject.bind(null, p.id)} className="flex flex-wrap items-center gap-3">
            <input name="name" defaultValue={p.name} required className={`${inputClass} w-60`} />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={p.isActive} /> Active
            </label>
            <SubmitButton variant="secondary">保存</SubmitButton>
          </ActionForm>

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">Releases</h3>
            <ul className="mt-1 flex flex-wrap gap-2 text-sm">
              {releases.items
                .filter((r) => r.projectId === p.id)
                .map((r) => (
                  <li key={r.id} className="rounded bg-slate-100 px-2 py-0.5">
                    {r.name}
                  </li>
                ))}
            </ul>
            <ActionForm action={createRelease.bind(null, p.id)} resetOnSuccess className="mt-2 flex gap-2">
              <input name="name" required placeholder="v1.2.0" className={`${inputClass} w-40`} />
              <SubmitButton variant="secondary">Release追加</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      ))}

      <Card title="Projectを追加">
        <ActionForm action={createProject} resetOnSuccess className="flex flex-wrap gap-2">
          <input name="name" required placeholder="Remeet" className={`${inputClass} w-48`} />
          <input name="slug" required placeholder="remeet" pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${inputClass} w-48`} />
          <SubmitButton>追加</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
