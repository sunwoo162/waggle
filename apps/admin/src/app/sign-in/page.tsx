import { ArrowUpRight, ChevronDown, CircleAlert, Wifi } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { LogoutButton } from "@/components/auth/logout-button";
import { readAuthConfig } from "@/server/auth/config";
import { getAdminAccess } from "@/server/auth/runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영자 로그인" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string }>;
}) {
  const params = await searchParams;
  const config = readAuthConfig(process.env);
  const access = await getAdminAccess(await headers());
  if (access.kind === "authorized") redirect("/admin");
  const unavailable = access.kind === "unavailable";
  const forbidden = access.kind === "forbidden" || params.reason === "forbidden";
  const failed = Boolean(params.error) || params.reason === "provider";

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-wordmark">
          <Link className="brand" href="/sign-in" aria-label="와글 운영자 로그인">
            <span className="brand-icon">
              <Wifi size={20} aria-hidden="true" />
            </span>
            <strong>와글</strong>
          </Link>
          <span className="login-workspace">관리자</span>
        </div>
        <a href="/project-docs/handbook/index.html" className="login-doc-link">
          프로젝트 문서
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </header>

      <main className="login-main" id="content">
        <section className="login-form" aria-labelledby="login-title">
          <div className="login-intro">
            <div>
              <h1 id="login-title">관리자 로그인</h1>
              <p className="login-description">DataGSM 계정으로 로그인하세요.</p>
            </div>
            <div className="login-mascot" aria-hidden="true" />
          </div>

          <LoginButton enabled={config.ready && !unavailable} />
          <p className="login-permissions">지정된 운영자 계정만 접근할 수 있습니다.</p>

          {!config.ready ? (
            <div className="login-notice setup">
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <strong>로그인 설정이 필요합니다</strong>
                <p>DataGSM 클라이언트를 등록한 뒤 운영자 계정을 지정해주세요.</p>
              </div>
            </div>
          ) : unavailable ? (
            <div className="login-notice" role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <strong>인증 서버를 확인해주세요</strong>
                <p>인증 스키마 준비와 서버 상태를 확인한 뒤 다시 시도해주세요.</p>
              </div>
            </div>
          ) : forbidden || failed ? (
            <div className="login-notice" role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <strong>
                  {forbidden ? "관리자 권한이 없는 계정입니다" : "로그인을 완료하지 못했습니다"}
                </strong>
                <p>
                  운영자로 지정된 계정인지 확인해주세요. 인증을 취소했다면 다시 시도할 수 있습니다.
                </p>
              </div>
            </div>
          ) : null}

          {access.kind === "forbidden" ? (
            <div className="login-change-account">
              <span>현재 계정에서 로그아웃</span>
              <LogoutButton />
            </div>
          ) : null}

          {!config.ready || unavailable ? (
            <details className="login-setup">
              <summary>
                운영자 설정 방법
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div>
                <ol>
                  <li>DataGSM에서 와글 클라이언트를 등록합니다.</li>
                  <li>
                    <code>apps/admin/.env.local</code>에 클라이언트 ID와 운영자 고유 ID를
                    입력합니다.
                  </li>
                  <li>
                    <code>npm run auth:migrate</code> 실행 후 서버를 다시 시작합니다.
                  </li>
                </ol>
                <p>자세한 절차는 저장소의 인증 설정 문서를 참고하세요. 비밀값은 공유하지 마세요.</p>
              </div>
            </details>
          ) : (
            <p className="login-help">
              다른 계정으로 연결되나요?{" "}
              <a href="https://datagsm.kr/myinfo" target="_blank" rel="noreferrer">
                DataGSM 계정 확인
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </p>
          )}
        </section>
      </main>

      <footer className="login-footer">와글 · 광주소프트웨어마이스터고등학교</footer>
    </div>
  );
}
