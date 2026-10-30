import type { Metadata } from "next";
import { InviteManager } from "@/components/members/manager";
import { requireAdmin } from "@/server/auth/guard";
import { getMemberState } from "@/server/members/runtime";

export const metadata: Metadata = { title: "개인 코드" };
export default async function InvitesPage() {
  await requireAdmin();
  const state = getMemberState();
  return state.ready ? (
    <InviteManager initial={state.snapshot} />
  ) : (
    <div className="school-page">
      <header className="school-heading">
        <div>
          <h1>개인 코드</h1>
          <p>사용자 인증 저장소를 먼저 준비해주세요.</p>
        </div>
      </header>
      <section className="school-editor">
        <h2>인증 저장소 준비가 필요해요</h2>
        <p>
          서버 설정을 확인한 뒤 <code>npm run members:migrate</code>를 실행하고 서버를 다시
          시작해주세요. 기존 키를 임의로 바꾸지 마세요.
        </p>
        <p>계속 표시된다면 저장소 권한과 마이그레이션 상태를 확인해주세요.</p>
        <a href="/admin/documents?section=resources">개발·운영 문서 보기</a>
      </section>
    </div>
  );
}
