"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureMemberForEmailDomain,
  isAllowedEmailDomain,
} from "@/lib/email-login";
import type { LoginFormState } from "./login-state";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 大学メールドメイン判別ログイン（メール OTP）。
 * step=request: ドメインを事前チェックして認証コード付きメールを送信。
 * step=verify: 6桁コードを検証し、member が無ければドメインから自動作成。
 * メール内のリンクをクリックした場合は /auth/callback 経由で同じ結果になる。
 */
export async function submitEmailLogin(
  prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const step = String(formData.get("step") ?? "request");

  if (step === "request") {
    return requestOtp(formData);
  }
  return verifyOtp(prev, formData);
}

async function requestOtp(formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return {
      step: "request",
      email,
      error: "メールアドレスの形式が正しくありません。",
    };
  }

  let allowed: boolean;
  try {
    allowed = await isAllowedEmailDomain(email);
  } catch {
    return {
      step: "request",
      email,
      error: "確認処理に失敗しました。時間をおいて再度お試しください。",
    };
  }

  if (!allowed) {
    return {
      step: "request",
      email,
      error:
        "このメールドメインは自動入部の対象ではありません。招待コードをお持ちの場合は「招待コードでサインアップ」からご参加ください。",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return {
      step: "request",
      email,
      error:
        "認証メールの送信に失敗しました。時間をおいて再度お試しください。",
    };
  }

  return {
    step: "verify",
    email,
    notice:
      "認証メールを送信しました。メール内のリンクをクリックするか、6桁の認証コードを入力してください。",
  };
}

async function verifyOtp(
  prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = prev.email || String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();

  if (!/^\d{6}$/.test(token)) {
    return {
      step: "verify",
      email,
      error: "6桁の認証コードを入力してください。",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    return {
      step: "verify",
      email,
      error: "認証コードが正しくないか、期限切れです。",
    };
  }

  let result;
  try {
    result = await ensureMemberForEmailDomain(data.user.id, email);
  } catch {
    // 半端なセッションは残さない（auth/callback と同じ方針）。
    await supabase.auth.signOut();
    return {
      step: "request",
      email,
      error:
        "参加処理に失敗しました。時間をおいて再度お試しください。解決しない場合は運営にお問い合わせください。",
    };
  }

  if (result === "no_org") {
    await supabase.auth.signOut();
    return {
      step: "request",
      email,
      error:
        "このメールドメインは自動入部の対象ではありません。招待コードをお持ちの場合は「招待コードでサインアップ」からご参加ください。",
    };
  }

  redirect("/");
}
