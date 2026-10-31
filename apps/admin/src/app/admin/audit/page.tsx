import type { Metadata } from "next";
import { SchoolSetupNotice } from "@/components/school/setup-notice";
import { requireAdmin } from "@/server/auth/guard";
import { getSchoolStore } from "@/server/school/runtime";
import type { AuditEntry } from "@/server/school/store";

export const metadata: Metadata = { title: "작업 기록" };
const labels: Record<string, string> = {
  "network.save": "네트워크 저장",
  "ap.save": "AP 저장",
  "wifi-request.approve": "등록 요청 승인",
  "wifi-request.reject": "등록 요청 거절",
  "member.issue": "개인 코드 발급",
  "member.reissue": "개인 코드 재발급",
  "member.revoke": "개인 코드 회수",
  "member.device-revoke": "기기 세션 회수",
};
export default async function AuditPage() {
  await requireAdmin();
  let entries: AuditEntry[];
  try {
    entries = getSchoolStore().auditLog();
  } catch {
    return <SchoolSetupNotice />;
  }
  return (
    <section className="school-page">
      <header className="school-heading">
        <div>
          <h1>작업 기록</h1>
          <p>
            운영자가 바꾼 항목과 시각만 남깁니다. 비밀번호·개인 코드·토큰 같은 값은 기록하지
            않습니다. 최근 200건까지 보여줘요.
          </p>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="school-message success">아직 기록이 없어요.</p>
      ) : (
        <ul className="school-list" aria-label="작업 기록">
          {entries.map((e) => (
            <li key={`${e.at}-${e.target}-${e.action}`} className="school-network-row">
              <div className="school-record-name">
                <strong>{labels[e.action] || e.action}</strong>
                <code>{e.target}</code>
              </div>
              <div className="school-record-details">
                <span>{new Date(e.at).toLocaleString("ko-KR")}</span>
                <span>운영자 {e.operator.slice(0, 8)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
