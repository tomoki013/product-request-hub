import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold">Product Request Hub</h1>
        <p className="mt-1 text-sm text-slate-500">登録済みのメールアドレスでログインしてください。</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <LoginForm next={next?.startsWith("/") ? next : "/requests"} />
      </div>
    </main>
  );
}
