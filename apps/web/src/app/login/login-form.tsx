"use client";

import { buttonClass, inputClass } from "@prh/ui";
import { useActionState } from "react";
import { sendMagicLink } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, null);
  if (state?.ok) {
    return <p className="mt-4 text-sm text-emerald-700">ログイン用のリンクをメールで送信しました。</p>;
  }
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input name="email" type="email" required placeholder="you@example.com" className={`${inputClass} w-full`} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className={`${buttonClass("primary")} w-full`} disabled={pending}>
        {pending ? "送信中..." : "ログインリンクを送信"}
      </button>
    </form>
  );
}
