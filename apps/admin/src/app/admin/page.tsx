import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
  FileText,
  Github,
  Monitor,
  Smartphone,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/guard";

const chapters = [
  {
    title: "프로젝트 소개",
    text: "와글이 해결할 문제와 첫 출시 범위",
    section: "overview",
    icon: Wifi,
  },
  {
    title: "기능명세서",
    text: "사용자와 관리자의 기능·완료 조건",
    section: "features",
    icon: FileText,
  },
  {
    title: "전체 화면 명세",
    text: "Android · Windows · 관리자 웹 34종",
    section: "screens",
    icon: Monitor,
  },
  {
    title: "디자인 시스템",
    text: "와글의 색과 간격, BASE 디자인 기준",
    section: "design",
    icon: Code2,
  },
];

export default async function AdminHome() {
  await requireAdmin();
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow">HELLO, WAGGLE</div>
          <h1>
            좋은 연결의 시작<span>.</span>
          </h1>
          <p>학교의 전파를 더 편하게, 더 즐겁게. 와글을 만들어가는 공간이에요.</p>
        </div>
        <span className="version-label">v0.1 · 개발 시작</span>
      </div>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="welcome-tag">
            <BookOpen size={14} aria-hidden="true" />
            와글 프로젝트
          </span>
          <h2 id="welcome-title">
            연결은 와글이.
            <br />
            우리는 하던 일에 집중해요.
          </h2>
          <p>
            와이파이를 관리하고 전파 친구를 수집하는 새로운 교내 경험.
            <br />
            확정된 기획과 다음 개발 과정을 한곳에서 확인하세요.
          </p>
          <Link className="primary-button" href="/admin/documents">
            프로젝트 문서 보기
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="art-ring ring-one" />
          <span className="art-ring ring-two" />
          <div className="mascot-tile mascot-book" />
          <div className="mascot-tile mascot-food" />
          <span className="art-caption">
            <span />
            함께 모으는 전파 친구들
          </span>
        </div>
      </section>
      <div className="project-facts">
        <div>
          <span className="fact-icon">
            <BookOpen size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>
              13<span>개</span>
            </strong>
            <small>정리된 프로젝트 문서</small>
          </span>
        </div>
        <div>
          <span className="fact-icon pink">
            <Monitor size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>
              34<span>종</span>
            </strong>
            <small>플랫폼별 기본 화면 명세</small>
          </span>
        </div>
        <div>
          <span className="fact-icon gray">
            <Smartphone size={18} aria-hidden="true" />
          </span>
          <span>
            <strong className="fact-platform">Android · Windows</strong>
            <small>학생 앱과 관리자 웹</small>
          </span>
        </div>
      </div>
      <section className="chapter-section" aria-labelledby="chapters-title">
        <div className="section-heading">
          <div>
            <h2 id="chapters-title">먼저 읽어보세요</h2>
            <p>프로젝트의 기준이 되는 문서예요.</p>
          </div>
          <Link href="/admin/documents">
            전체 문서
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="chapter-grid">
          {chapters.map(({ title, text, section, icon: Icon }) => (
            <Link
              className="chapter-card"
              key={section}
              href={`/admin/documents?section=${section}`}
            >
              <Icon size={21} aria-hidden="true" />
              <ArrowUpRight className="chapter-arrow" size={16} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </Link>
          ))}
        </div>
      </section>
      <div className="bottom-grid">
        <section className="progress-panel" aria-labelledby="progress-title">
          <div className="section-heading">
            <h2 id="progress-title">지금 만들고 있어요</h2>
            <span className="text-label">DEVELOPMENT</span>
          </div>
          <ol className="development-steps">
            <li className="step-done">
              <span className="step-icon">
                <Check size={13} aria-hidden="true" />
              </span>
              <div>
                <strong>기획과 디자인 기준</strong>
                <small>제품 요구·화면 명세·BASE 정리</small>
              </div>
              <span className="step-state">정리됨</span>
            </li>
            <li className="step-current">
              <span className="step-icon">2</span>
              <div>
                <strong>인증과 개인 코드 관리</strong>
                <small>운영자 가드·코드 발급·기기별 세션 코드 구현</small>
              </div>
              <span className="step-state">현재</span>
            </li>
            <li>
              <span className="step-icon">3</span>
              <div>
                <strong>네트워크·AP 관리</strong>
                <small>암호화 저장·등록·수정·설치 위치 조회 코드 구현</small>
              </div>
              <span className="step-state">구현</span>
            </li>
          </ol>
        </section>
        <section className="github-panel">
          <Github size={24} aria-hidden="true" />
          <h2>
            작은 변경부터,
            <br />
            함께 볼 수 있는 기록으로.
          </h2>
          <p>이슈에서 시작해 작업 브랜치와 PR로 이어져요. 변경 이유와 확인 결과를 남깁니다.</p>
          <a href="https://github.com/sunwoo162/waggle" target="_blank" rel="noreferrer">
            GitHub 저장소
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </section>
      </div>
      <div className="development-notice">
        <ArrowDown size={14} aria-hidden="true" />
        <p>
          운영자 인증·개인 코드·네트워크·AP 관리 코드를 구현한 개발 환경입니다. 실제 계정 연동, 교내
          데이터 등록과 앱 배포·기기 연결은 검증 전입니다.
        </p>
      </div>
    </div>
  );
}
