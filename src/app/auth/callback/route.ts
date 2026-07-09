import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureMemberForUser } from "@/lib/signup";
import { ensureMemberForEmailDomain } from "@/lib/email-login";

/**
 * Google OAuth / メール OTP マジックリンクのリダイレクト先。
 * 認可コードをセッションに交換し、未登録なら
 *   1. 招待コード(cookie)を検証して member を作成（requirements-v0.1.md §6）
 *   2. 招待が無ければ、大学メールドメイン判別で member を作成（migration 012）
 * の順に試す。どちらも不成立ならサインアウトして招待要求に戻す。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/join?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/join?error=auth`);
  }

  let result;
  try {
    result = await ensureMemberForUser(data.user.id, data.user.user_metadata);

    if (result === "no_invite" && data.user.email) {
      // 招待コードなし → 大学メールドメインでの自動入部を試す。
      const domainResult = await ensureMemberForEmailDomain(
        data.user.id,
        data.user.email,
      );
      if (domainResult !== "no_org") {
        result = domainResult;
      }
    }
  } catch {
    // RPC 失敗時も 500 にせず join に戻す。半端なセッションは残さない。
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/join?error=signup_failed`);
  }

  if (result === "no_invite") {
    // セッションは張られているが member が無い → 招待が必要。
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/join?error=need_invite`);
  }

  return NextResponse.redirect(`${origin}/`);
}
