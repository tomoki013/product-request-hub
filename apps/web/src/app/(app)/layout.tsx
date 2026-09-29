import type { Me } from "@prh/shared";
import { USER_ROLE_LABELS } from "@prh/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { isDevAuth } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await api<Me>("/me");
  const isAdmin = me.permissions.includes("admin:projects");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/requests" className="font-semibold">
            Product Request Hub
          </Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/requests" className="hover:text-slate-900">
              Requests
            </Link>
            {isAdmin && (
              <>
                <Link href="/settings/projects" className="hover:text-slate-900">
                  Projects
                </Link>
                <Link href="/settings/discord" className="hover:text-slate-900">
                  Discord
                </Link>
                <Link href="/settings/users" className="hover:text-slate-900">
                  Users
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span>
              {me.workspace.name} · {me.name} ({USER_ROLE_LABELS[me.role]})
            </span>
            {!isDevAuth() && (
              <form action="/auth/signout" method="post">
                <button className="hover:text-slate-900">ログアウト</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
