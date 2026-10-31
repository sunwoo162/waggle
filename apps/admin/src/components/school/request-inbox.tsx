"use client";
import { Inbox, RefreshCw } from "lucide-react";
import { useState } from "react";
import { securityOptions } from "../../shared/school";
import type { WifiRequestItem } from "../../shared/wifi-request";

export function WifiRequestInbox({ initial }: { initial: WifiRequestItem[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function call(url: string, method: "GET" | "POST", done: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, { method, cache: "no-store", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "처리하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      setRequests(result.requests);
      setNotice(done);
    } catch {
      setError("결과를 확인하지 못했습니다. 새로 불러오기로 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="school-page">
      <header className="school-heading">
        <div>
          <h1>등록 요청</h1>
          <p>
            학생이 보낸 교내 Wi-Fi 등록 요청입니다. 진짜 학교 Wi-Fi인지 확인한 뒤 승인하면 모든 학생
            앱에 배포됩니다. 승인 전에는 누구에게도 배포되지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="school-button secondary"
          disabled={busy}
          onClick={() => void call("/api/admin/wifi-requests", "GET", "최신 요청을 불러왔습니다.")}
        >
          <RefreshCw size={16} aria-hidden="true" />
          새로 불러오기
        </button>
      </header>
      <p
        className={`school-message ${error ? "error" : "success"}`}
        role="status"
        aria-live="polite"
      >
        {error || notice}
      </p>
      <div className="school-list-heading">
        <h2>확인 대기</h2>
        <span>{requests.length}건</span>
      </div>
      {requests.length === 0 ? (
        <div className="character-empty">
          <Inbox size={32} aria-hidden="true" />
          <h2>새 요청이 없어요</h2>
          <p>학생이 앱에서 등록을 요청하면 여기에 나타나요.</p>
        </div>
      ) : (
        <ul className="school-list" aria-label="등록 요청">
          {requests.map((r) => (
            <li key={r.id} className="school-network-row">
              <div className="school-record-name">
                <strong>{r.room}</strong>
                <span className="school-ssid">{r.ssid}</span>
              </div>
              <div className="school-record-details">
                <span>{securityOptions.find((s) => s.value === r.security)?.label}</span>
                <span>{new Date(r.createdAt).toLocaleString("ko-KR")}</span>
              </div>
              <div className="school-row-actions">
                <button
                  type="button"
                  className="school-button"
                  disabled={busy}
                  onClick={() =>
                    void call(
                      `/api/admin/wifi-requests/${r.id}/approve`,
                      "POST",
                      `${r.room} Wi-Fi를 등록했습니다. 다음 동기화 때 앱에 배포됩니다.`,
                    )
                  }
                >
                  승인
                </button>
                <button
                  type="button"
                  className="school-button secondary"
                  disabled={busy}
                  onClick={() =>
                    void call(
                      `/api/admin/wifi-requests/${r.id}/reject`,
                      "POST",
                      "요청을 거절하고 내용을 지웠습니다.",
                    )
                  }
                >
                  거절
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
