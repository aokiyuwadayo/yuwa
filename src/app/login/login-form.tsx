"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialLoginState, submitEmailLogin } from "./actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    submitEmailLogin,
    initialLoginState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="rounded-md bg-brand-600/10 px-3 py-2 text-sm text-brand-600">
          {state.notice}
        </p>
      )}

      {state.step === "request" ? (
        <>
          <input type="hidden" name="step" value="request" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">大学のメールアドレス</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="s00a0000@example.ac.jp"
              defaultValue={state.email}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "送信中..." : "認証メールを送信"}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="step" value="verify" />
          <input type="hidden" name="email" value={state.email} />
          <p className="text-sm text-muted-foreground">
            送信先: <span className="font-medium">{state.email}</span>
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="token">認証コード（6桁）</Label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "確認中..." : "ログイン"}
          </Button>
          <p className="text-xs text-muted-foreground">
            メール内のリンクをクリックした場合は、このコード入力は不要です。
          </p>
        </>
      )}
    </form>
  );
}
