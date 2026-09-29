import { USER_ROLE_LABELS, USER_ROLES, type UserRole } from "@prh/shared";
import { Card, inputClass } from "@prh/ui";
import { ActionForm, InlineSelect, SubmitButton } from "@/components/forms";
import { api } from "@/lib/api";
import { createUser, updateUserRole } from "../actions";

interface User {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  discordUserId: string | null;
}

const roleOptions = USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }));

export default async function UsersPage() {
  const users = await api<{ items: User[] }>("/users");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <Card>
        <p className="mb-3 text-xs text-slate-500">
          Discordから初めてRequestを登録したユーザーは Requester として自動追加されます。
          管理画面にログインするにはメールアドレスの登録が必要です。
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 font-medium">Email</th>
              <th className="py-1 font-medium">Discord</th>
              <th className="py-1 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.items.map((u) => (
              <tr key={u.id}>
                <td className="py-2">{u.name}</td>
                <td className="py-2 text-slate-600">{u.email ?? "-"}</td>
                <td className="py-2 font-mono text-xs text-slate-500">{u.discordUserId ?? "-"}</td>
                <td className="py-2">
                  <InlineSelect action={updateUserRole.bind(null, u.id)} name="role" value={u.role} options={roleOptions} allowEmpty={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="ユーザーを追加">
        <ActionForm action={createUser} resetOnSuccess className="flex flex-wrap gap-2">
          <input name="name" required placeholder="名前" className={`${inputClass} w-40`} />
          <input name="email" type="email" required placeholder="email" className={`${inputClass} w-56`} />
          <select name="role" defaultValue="requester" className={`${inputClass} w-40`}>
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <SubmitButton>追加</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
