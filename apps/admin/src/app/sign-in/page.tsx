import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  LockKeyhole,
  ShieldCheck,
  Wifi,
} from "lucide-react";
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
        <Link className="brand" href="/sign-in" aria-label="와글 운영자 로그인">
          <span className="brand-icon">
            <Wifi size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>
              와글<span className="brand-dot">.</span>
            </strong>
            <small>GSM CAMPUS PROJECT</small>
          </span>
        </Link>
        <a href="/project-docs/handbook/index.html" className="login-doc-link">
          <BookOpen size={15} aria-hidden="true" />
          프로젝트 문서
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>
      <main className="login-main" id="content">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="eyebrow">A LITTLE BETTER CONNECTION</div>
          <h1 id="login-story-title">
            연결은 와글이.
            <br />
            학교의 전파는
            <br />
            <span>더 즐겁게.</span>
          </h1>
          <p>
            좋은 연결을 준비하는 당신을 위한 공간.
            <br />
            학교의 와이파이와 전파 친구들을 함께 관리해요.
          </p>
          <div className="login-character-scene" aria-hidden="true">
            <span className="login-ring" />
            <div className="login-mascot first" />
            <div className="login-mascot second" />
            <div className="character-caption">
              <span />
              새로운 연결이 모이는 중
            </div>
          </div>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <span className="login-lock">
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <div className="eyebrow">ADMIN WORKSPACE</div>
          <h2 id="login-title">와글 운영자 로그인</h2>
          <p className="login-description">DataGSM 계정으로 와글 관리 공간에 들어오세요.</p>
          {!config.ready ? (
            <div className="login-notice setup">
              <span className="notice-dot" />
              <div>
                <strong>로그인 연동을 준비하고 있어요</strong>
                <p>DataGSM 클라이언트 등록과 운영자 설정이 완료되면 로그인할 수 있어요.</p>
              </div>
            </div>
          ) : unavailable ? (
            <div className="login-notice" role="alert">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>로그인 저장소를 확인해주세요</strong>
                <p>인증 스키마 준비와 서버 상태를 확인한 뒤 다시 열어주세요.</p>
              </div>
            </div>
          ) : forbidden || failed ? (
            <div className="login-notice" role="alert">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>
                  {forbidden ? "관리자 권한이 없는 계정이에요" : "로그인을 완료하지 못했어요"}
                </strong>
                <p>
                  운영자로 지정된 DataGSM 계정인지 확인해주세요. 취소했거나 연결이 지연됐다면 다시
                  시도할 수 있어요.
                </p>
              </div>
            </div>
          ) : null}
          <LoginButton enabled={config.ready && !unavailable} />
          <div className="login-permissions">
            <p>
              <Check size={14} aria-hidden="true" />
              사전에 지정한 운영자 한 명만 접근해요.
            </p>
            <p>
              <Check size={14} aria-hidden="true" />
              학교 계정 인증은 DataGSM에서 진행해요.
            </p>
          </div>
          {access.kind === "forbidden" ? (
            <div className="login-change-account">
              <span>현재 와글 세션에서 로그아웃</span>
              <LogoutButton />
            </div>
          ) : null}
          {!config.ready || unavailable ? (
            <details className="login-setup">
              <summary>
                운영자 설정 안내
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <div>
                <ol>
                  <li>DataGSM에서 와글 클라이언트를 등록해요.</li>
                  <li>
                    <code>apps/admin/.env.local</code>에 클라이언트 ID와 운영자 고유 ID를 입력해요.
                  </li>
                  <li>
                    <code>npm run auth:migrate</code> 후 서버를 다시 시작해요.
                  </li>
                </ol>
                <p>
                  비밀값을 채팅이나 GitHub에 올리지 마세요. 자세한 절차는 저장소의 인증 설정 문서를
                  확인하세요.
                </p>
              </div>
            </details>
          ) : (
            <p className="login-help">
              다른 계정이 선택된다면{" "}
              <a href="https://datagsm.kr/myinfo" target="_blank" rel="noreferrer">
                DataGSM에서 계정을 확인
              </a>
              해주세요.
            </p>
          )}
          <div className="login-card-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            와글 운영자를 위한 관리 공간
          </div>
        </section>
      </main>
      <footer className="login-footer">
        <span>와글 · 연결은 편하게, 학교의 전파는 즐겁게.</span>
        <span>Android · Windows · Web</span>
      </footer>
    </div>
  );
}
