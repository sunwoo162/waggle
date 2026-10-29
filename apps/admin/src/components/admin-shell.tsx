import { BookOpen, ChevronRight, MapPin, Radio, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./auth/logout-button";

export function AdminShell({
  children,
  operatorName,
}: {
  children: ReactNode;
  operatorName: string;
}) {
  return (
    <div className="admin-layout">
      <a className="skip-link" href="#content">
        본문으로 건너뛰기
      </a>
      <aside className="admin-sidebar">
        <Link className="brand" href="/admin" aria-label="와글 관리자 홈">
          <span className="brand-icon">
            <Wifi size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>
              와글<span className="brand-dot">.</span>
            </strong>
            <small>ADMIN WORKSPACE</small>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="school-avatar">G</span>
          <span>
            GSM 캠퍼스<small>와글 프로젝트</small>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </div>
        <div className="nav-label">워크스페이스</div>
        <AdminNav />
        <div className="upcoming-nav">
          <div className="nav-label">다음에 만나요</div>
          <span>
            <Radio size={17} aria-hidden="true" />
            네트워크<small>준비 중</small>
          </span>
          <span>
            <MapPin size={17} aria-hidden="true" />
            AP 위치<small>준비 중</small>
          </span>
          <span>
            <Sparkles size={17} aria-hidden="true" />
            도감 관리<small>준비 중</small>
          </span>
        </div>
        <div className="sidebar-note">
          <BookOpen size={18} aria-hidden="true" />
          <strong>함께 만드는 연결</strong>
          <p>
            와글이 만들어지는 과정을
            <br />
            프로젝트 문서에서 확인하세요.
          </p>
          <Link href="/admin/documents">
            문서 읽기 <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <div className="sidebar-footer">
          <span className="operator-avatar">W</span>
          <span>
            {operatorName}
            <small>인증된 와글 운영자</small>
          </span>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>
            <span className="breadcrumb-muted">와글</span>
            <ChevronRight size={13} aria-hidden="true" />
            관리자 워크스페이스
          </span>
          <div className="topbar-account">
            <span className="environment-badge">
              <ShieldCheck size={13} aria-hidden="true" />
              개발 단계
            </span>
            <LogoutButton />
          </div>
        </header>
        <main id="content">{children}</main>
      </div>
    </div>
  );
}
