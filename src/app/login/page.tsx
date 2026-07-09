import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentMember } from "@/lib/member";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage() {
  // 既にメンバーならトップへ。
  const member = await getCurrentMember();
  if (member) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="font-display bg-linear-to-r from-brand-600 via-sky-500 to-teal-400 bg-clip-text text-3xl font-bold text-transparent">
          Wacca
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          大学メールでログイン
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">大学メールでログイン</CardTitle>
          <CardDescription>
            登録済みの大学ドメインのメールアドレスなら、招待コードなしで参加できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        招待コードをお持ちの方は{" "}
        <Link href="/join" className="underline">
          招待コードでサインアップ
        </Link>
        {" "}／{" "}
        <Link href="/" className="underline">
          トップに戻る
        </Link>
      </p>
    </main>
  );
}
