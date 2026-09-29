import { Card, inputClass } from "@prh/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { api } from "@/lib/api";
import { createIntegration, createMapping, deleteMapping, updateMapping } from "../actions";

interface Integration {
  id: string;
  name: string | null;
  discordGuildId: string;
  status: "active" | "disabled";
}
interface Mapping {
  id: string;
  discordGuildId: string;
  discordChannelId: string;
  requestEnabled: boolean;
  projectId: string;
  projectName: string;
  integrationName: string | null;
}

export default async function DiscordSettingsPage() {
  const [integrations, mappings, projects] = await Promise.all([
    api<{ items: Integration[] }>("/discord/integrations"),
    api<{ items: Mapping[] }>("/channel-mappings"),
    api<{ items: { id: string; name: string; isActive: boolean }[] }>("/projects"),
  ]);
  const projectOptions = projects.items.filter((p) => p.isActive);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Discord</h1>

      <Card title="Channel Mapping">
        <p className="mb-3 text-xs text-slate-500">
          /request を実行したチャンネルからProjectを自動決定します。登録者にProjectを選ばせることはありません。
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Server</th>
              <th className="py-1 font-medium">Channel ID</th>
              <th className="py-1 font-medium">Project / 有効</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mappings.items.map((m) => (
              <tr key={m.id}>
                <td className="py-2">{m.integrationName ?? m.discordGuildId}</td>
                <td className="py-2 font-mono text-xs">{m.discordChannelId}</td>
                <td className="py-2">
                  <ActionForm action={updateMapping.bind(null, m.id)} className="flex items-center gap-2">
                    <select name="projectId" defaultValue={m.projectId} className={`${inputClass} w-36`}>
                      {projects.items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input type="checkbox" name="requestEnabled" defaultChecked={m.requestEnabled} aria-label="Request有効" />
                    <SubmitButton variant="secondary">保存</SubmitButton>
                  </ActionForm>
                </td>
                <td className="py-2 text-right">
                  <ActionForm action={deleteMapping.bind(null, m.id)}>
                    <SubmitButton variant="danger">削除</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {integrations.items.length > 0 && (
          <ActionForm action={createMapping} resetOnSuccess className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <select name="discordGuildId" className={`${inputClass} w-48`}>
              {integrations.items.map((i) => (
                <option key={i.id} value={i.discordGuildId}>
                  {i.name ?? i.discordGuildId}
                </option>
              ))}
            </select>
            <input name="discordChannelId" required placeholder="Channel ID" className={`${inputClass} w-48`} />
            <select name="projectId" className={`${inputClass} w-40`}>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <SubmitButton>追加</SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card title="Discord Integration">
        <ul className="space-y-1 text-sm">
          {integrations.items.map((i) => (
            <li key={i.id}>
              {i.name ?? "(no name)"} <span className="font-mono text-xs text-slate-500">{i.discordGuildId}</span>{" "}
              <span className="text-xs text-slate-500">{i.status}</span>
            </li>
          ))}
        </ul>
        <ActionForm action={createIntegration} resetOnSuccess className="mt-3 flex flex-wrap gap-2">
          <input name="name" placeholder="Zakkary Discord" className={`${inputClass} w-48`} />
          <input name="discordGuildId" required placeholder="Server (Guild) ID" className={`${inputClass} w-48`} />
          <SubmitButton>サーバーを追加</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
