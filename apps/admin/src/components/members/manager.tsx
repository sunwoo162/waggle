"use client";

import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InviteMember, MemberSnapshot } from "../../shared/members";

type Confirmation = { member: InviteMember; action: "reissue" | "revoke"; deviceId?: string };
function date(value: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}
export function InviteManager({ initial }: { initial: MemberSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [alias, setAlias] = useState("");
  const [issued, setIssued] = useState<{ code: string; alias: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const locked = useRef(false);
  const visibilityEpoch = useRef(0);
  const anchor = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const hide = () => {
      visibilityEpoch.current += 1;
      setIssued(null);
      setCopied(false);
    };
    const visibilityChanged = () => {
      if (document.hidden) hide();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", hide);
    return () => {
      visibilityEpoch.current += 1;
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  const members = snapshot.members.filter((m) =>
    m.alias.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function focusPanel() {
    requestAnimationFrame(() => {
      anchor.current?.focus();
      anchor.current?.scrollIntoView({ block: "nearest" });
    });
  }
  function reset() {
    setIssued(null);
    setCopied(false);
    setConfirmation(null);
    setCreating(false);
    setError("");
    setNotice("");
  }
  async function refresh() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    reset();
    try {
      const response = await fetch("/api/admin/members", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("refresh_failed");
      setSnapshot(await response.json());
      setNotice("최신 목록을 불러왔습니다.");
    } catch {
      setError("목록을 불러오지 못했습니다. 로그인과 서버 상태를 확인해주세요.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function mutate(path: string, body: Record<string, unknown>, label: string) {
    if (locked.current) return;
    const requestEpoch = visibilityEpoch.current;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setIssued(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/admin/members${path}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "변경하지 못했습니다. 최신 목록을 확인해주세요.");
        return;
      }
      setSnapshot(data.snapshot);
      setCreating(false);
      setAlias("");
      setConfirmation(null);
      if (data.code) {
        if (requestEpoch === visibilityEpoch.current && !document.hidden) {
          setIssued({ code: data.code, alias: data.member.alias });
        } else {
          setNotice("발급 중 화면을 떠나 코드를 숨겼습니다. 필요하면 재발급해주세요.");
        }
        focusPanel();
      } else {
        setNotice(label);
        addButton.current?.focus();
      }
    } catch {
      setError(
        "처리 결과를 확인하지 못했습니다. 최신 목록을 불러와 확인해주세요. 발급한 코드를 받지 못했다면 재발급이 필요합니다.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function confirm(value: Confirmation) {
    reset();
    setConfirmation(value);
    focusPanel();
  }
  function hideCode() {
    setIssued(null);
    setCopied(false);
    setNotice("코드를 숨겼습니다. 다시 필요하면 재발급해주세요.");
    addButton.current?.focus();
  }
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      setError("자동 복사가 허용되지 않았습니다. 표시된 코드를 직접 선택해 복사해주세요.");
    }
  }
  return (
    <div className="school-page invite-page">
      <header className="school-heading">
        <div>
          <h1>개인 코드</h1>
          <p>교내 이용자에게 로그인 코드를 발급하고 기기 세션을 관리합니다.</p>
        </div>
        <button
          ref={addButton}
          className="school-button"
          type="button"
          disabled={busy}
          onClick={() => {
            reset();
            setAlias("");
            setCreating(true);
            focusPanel();
          }}
        >
          <Plus size={17} aria-hidden="true" />
          코드 발급
        </button>
      </header>
      <div className="school-meta">
        <span>이용자 {snapshot.members.length}명</span>
        <span>
          사용 중인 기기 세션{" "}
          {snapshot.members.reduce(
            (n, m) => n + m.devices.filter((d) => d.status === "active").length,
            0,
          )}
          개
        </span>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
          새로고침
        </button>
      </div>
      <p className="school-message success" role="status">
        {notice}
      </p>
      {error ? (
        <div className="school-message error" role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            최신 목록 불러오기
          </button>
          <a href="/sign-in">로그인 확인</a>
        </div>
      ) : null}
      <div ref={anchor} tabIndex={-1} className="school-editor-anchor">
        {creating ? (
          <form
            className="school-editor invite-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate("", { alias }, "코드를 발급했습니다.");
            }}
          >
            <h2>새 개인 코드</h2>
            <fieldset disabled={busy}>
              <div className="school-fields">
                <label className="school-field-wide">
                  이용자 표시 이름
                  <input
                    name="alias"
                    value={alias}
                    maxLength={80}
                    required
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="누구에게 발급하는 코드인가요?"
                    autoComplete="off"
                  />
                  <small>
                    관리할 때 구분하기 위한 이름입니다. 이름으로 계정을 자동 연결하지 않습니다.
                  </small>
                </label>
              </div>
              <p className="school-form-note">
                발급한 코드는 한 번만 표시됩니다. 같은 코드로 휴대폰과 노트북에 로그인할 수
                있습니다.
              </p>
              <div className="school-form-actions">
                <button
                  className="school-button secondary"
                  type="button"
                  onClick={() => {
                    reset();
                    addButton.current?.focus();
                  }}
                >
                  취소
                </button>
                <button className="school-button" type="submit" disabled={!alias.trim()}>
                  {busy ? "발급 중…" : "개인 코드 발급"}
                </button>
              </div>
            </fieldset>
          </form>
        ) : null}
        {issued ? (
          <section className="invite-secret" aria-labelledby="issued-title">
            <div className="invite-secret-heading">
              <KeyRound size={20} aria-hidden="true" />
              <h2 id="issued-title">{issued.alias}님의 코드</h2>
              <button type="button" aria-label="코드 숨기기" onClick={hideCode}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p>지금 한 번만 확인할 수 있어요. 이용자에게 직접 전달해주세요.</p>
            <code className="invite-code" translate="no">
              {issued.code}
            </code>
            <div className="invite-secret-actions">
              <button className="school-button" type="button" onClick={() => void copy()}>
                {copied ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copied ? "복사 완료" : "코드 복사"}
              </button>
              <button className="school-button secondary" type="button" onClick={hideCode}>
                전달 완료 · 숨기기
              </button>
            </div>
            <small>
              페이지를 떠나거나 다른 탭으로 이동하면 코드가 숨겨집니다. 목록에서는 다시 볼 수
              없습니다.
            </small>
          </section>
        ) : null}
        {confirmation ? (
          <section className="school-editor invite-confirm" aria-labelledby="confirm-title">
            <h2 id="confirm-title">
              {confirmation.member.alias} ·{" "}
              {confirmation.deviceId
                ? "기기 세션 회수"
                : confirmation.action === "reissue"
                  ? "코드 재발급"
                  : "코드 회수"}
            </h2>
            <p>
              {confirmation.deviceId
                ? "선택한 기기만 와글에서 로그아웃됩니다. 다른 기기는 계속 사용할 수 있습니다."
                : confirmation.action === "reissue"
                  ? "기존 코드와 모든 기기 세션이 차단됩니다. 새 코드로 다시 로그인해야 합니다."
                  : "이 코드와 모든 기기 세션을 차단합니다. 다시 이용하려면 코드를 재발급해주세요."}
            </p>
            <p className="school-form-note">
              와글 인증을 회수하는 기능입니다. 기기에 이미 저장된 학교 Wi-Fi 암호까지 삭제되지는
              않습니다.
            </p>
            <div className="school-form-actions">
              <button
                type="button"
                className="school-button secondary"
                disabled={busy}
                onClick={() => {
                  reset();
                  addButton.current?.focus();
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="school-button"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/${confirmation.member.id}/${confirmation.deviceId ? `sessions/${confirmation.deviceId}/revoke` : confirmation.action}`,
                    { revision: confirmation.member.revision },
                    confirmation.deviceId ? "기기 세션을 회수했습니다." : "코드를 회수했습니다.",
                  )
                }
              >
                {busy
                  ? "처리 중…"
                  : confirmation.action === "reissue"
                    ? "새 코드 발급"
                    : "회수하기"}
              </button>
            </div>
          </section>
        ) : null}
      </div>
      <div className="school-filters">
        <label className="school-search">
          <Search size={17} aria-hidden="true" />
          <span className="school-sr-only">이용자 검색</span>
          <input
            type="search"
            placeholder="이용자 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="invite-search-note">한 사람에게 코드 하나</span>
      </div>
      <div className="school-list-heading">
        <h2>발급 목록</h2>
        <span>{members.length}명</span>
      </div>
      {members.length ? (
        <ul className="invite-list">
          {members.map((m) => (
            <li key={m.id}>
              <div className="invite-member-row">
                <div className="invite-avatar" aria-hidden="true">
                  <Users size={19} />
                </div>
                <div className="school-record-name">
                  <strong>{m.alias}</strong>
                  <span>최근 발급 {date(m.issuedAt)}</span>
                </div>
                <span className={`school-state ${m.codeActive ? "active" : ""}`}>
                  {m.codeActive ? "사용 가능" : "회수됨"}
                </span>
                <div className="school-row-actions">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${m.alias} 코드 재발급`}
                    onClick={() => confirm({ member: m, action: "reissue" })}
                  >
                    재발급
                  </button>
                  <button
                    type="button"
                    disabled={busy || !m.codeActive}
                    aria-label={`${m.alias} 코드 회수`}
                    onClick={() => confirm({ member: m, action: "revoke" })}
                  >
                    회수
                  </button>
                </div>
              </div>
              <details className="invite-devices">
                <summary>
                  기기 세션{" "}
                  <span>
                    {m.devices.filter((d) => d.status === "active").length}개 사용 중 · 전체{" "}
                    {m.devices.length}개
                  </span>
                </summary>
                {m.devices.length ? (
                  <ul>
                    {m.devices.map((d) => (
                      <li key={d.id}>
                        {d.platform === "android" ? (
                          <Smartphone size={19} aria-hidden="true" />
                        ) : (
                          <Laptop size={19} aria-hidden="true" />
                        )}
                        <div className="invite-device-info">
                          <strong>{d.name}</strong>
                          <span>
                            {d.platform === "android" ? "Android" : "Windows"} · 최근 로그인·갱신{" "}
                            {date(d.refreshedAt)}
                          </span>
                          <span>세션 만료 {date(d.expiresAt)}</span>
                        </div>
                        <span className={`school-state ${d.status === "active" ? "active" : ""}`}>
                          {d.status === "active"
                            ? "유효"
                            : d.status === "expired"
                              ? "만료"
                              : "회수됨"}
                        </span>
                        <div className="school-row-actions">
                          <button
                            type="button"
                            disabled={busy || d.status !== "active"}
                            aria-label={`${m.alias} ${d.name} 세션 회수`}
                            onClick={() => confirm({ member: m, action: "revoke", deviceId: d.id })}
                          >
                            세션 회수
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>로그인한 기기가 없습니다. 앱에서 개인 코드를 입력하면 여기에 표시됩니다.</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <div className="school-empty">
          <KeyRound size={28} aria-hidden="true" />
          <h3>{query ? "일치하는 이용자가 없어요" : "아직 발급한 코드가 없어요"}</h3>
          <p>
            {query
              ? "검색어를 바꿔 다시 확인해주세요."
              : "이용자를 구분할 이름을 적고 첫 개인 코드를 발급해보세요."}
          </p>
        </div>
      )}
      <p className="school-footnote">
        유효한 세션은 현재 온라인 상태를 뜻하지 않습니다. 코드를 아는 사람은 로그인할 수 있으므로
        이용자별로 전달해주세요.
      </p>
    </div>
  );
}
