import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EmailDomainMemberResult = "exists" | "created" | "no_org";

/**
 * メール OTP ログイン後に呼ばれ、members 行が無ければメールドメインから
 * 組織を判別して作成する。招待コード経路（signup.ts）の姉妹関数。
 * RLS をバイパスするため service_role(admin) クライアントを使う。
 * ハッシュ生成〜insert のアトミック性は DB 関数 create_member_by_email_domain
 * に集約（migration 012 のコメント参照）。
 */
export async function ensureMemberForEmailDomain(
  userId: string,
  email: string,
): Promise<EmailDomainMemberResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("create_member_by_email_domain", {
    p_user_id: userId,
    p_email: email,
    p_display_name: deriveDisplayNameFromEmail(email),
  });
  if (error) {
    throw new Error(error.message);
  }

  return data as EmailDomainMemberResult;
}

/**
 * ドメインが自動入部の対象かを事前チェックする（OTP 送信前のガード）。
 * 対象外ドメインに OTP を送って orphan な auth.users を作らないため。
 */
export async function isAllowedEmailDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .contains("allowed_email_domains", [domain])
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
  return (data?.length ?? 0) > 0;
}

function deriveDisplayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim().slice(0, 80) ?? "";
  return local.length > 0 ? local : "メンバー";
}
