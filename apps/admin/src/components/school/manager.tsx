"use client";
import { MapPin, Plus, Radio, RefreshCw, Search } from "lucide-react";
import { useRef, useState } from "react";
import type { AccessPoint, Network, SchoolSnapshot } from "../../shared/school";
import { securityOptions } from "../../shared/school";
import { filterAccessPoints } from "../../shared/school-filters";
import { AccessPointEditor, NetworkEditor } from "./editors";

type Editor = { type: "network"; value?: Network } | { type: "ap"; value?: AccessPoint };
function networkInput(n: Network) {
  return {
    name: n.name,
    ssid: n.ssid,
    security: n.security,
    password: "",
    enabled: !n.enabled,
    revision: n.revision,
  };
}
function pointInput(a: AccessPoint) {
  return {
    networkId: a.networkId,
    name: a.name,
    bssid: a.bssid,
    building: a.building,
    floor: a.floor,
    place: a.place,
    enabled: !a.enabled,
    revision: a.revision,
  };
}

export function SchoolManager({
  initial,
  view,
}: {
  initial: SchoolSnapshot;
  view: "networks" | "access-points";
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [missing, setMissing] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const editorAnchor = useRef<HTMLDivElement>(null);
  const networkView = view === "networks";
  const networks = snapshot.networks.filter((n) =>
    `${n.name} ${n.ssid}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const points = filterAccessPoints(snapshot, { query, building, floor, missing });
  const buildings = [
    ...new Set(snapshot.accessPoints.map((a) => a.building).filter(Boolean)),
  ].sort();
  const floors = [
    ...new Set(
      snapshot.accessPoints
        .filter((a) => !building || a.building === building)
        .map((a) => a.floor)
        .filter(Boolean),
    ),
  ].sort();
  const networkById = new Map(snapshot.networks.map((n) => [n.id, n]));
  function edit(value: Editor) {
    setEditor(value);
    setError("");
    setNotice("");
    requestAnimationFrame(() => {
      editorAnchor.current?.scrollIntoView({ block: "nearest" });
      editorAnchor.current?.focus();
    });
  }
  function closeEditor() {
    setEditor(null);
    setError("");
    addButton.current?.focus();
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/school", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("refresh_failed");
      setSnapshot(await response.json());
      setEditor(null);
      setNotice("최신 정보를 불러왔습니다.");
    } catch {
      setError("목록을 불러오지 못했습니다. 로그인과 서버 상태를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function save(path: string, payload: Record<string, unknown>, updating: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/school/${path}`, {
        method: updating ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "저장하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      setSnapshot(data);
      setEditor(null);
      setNotice("설정을 저장했습니다.");
      addButton.current?.focus();
    } catch {
      setError("저장 결과를 확인하지 못했습니다. 최신 정보를 불러와 반영 여부를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="school-page">
      <header className="school-heading">
        <div>
          <h1>{networkView ? "네트워크" : "AP 위치"}</h1>
          <p>
            {networkView
              ? "학교 Wi-Fi의 연결 정보를 등록하고 관리합니다."
              : "주변 검색 여부와 관계없이 등록한 모든 AP의 설치 위치를 확인합니다."}
          </p>
        </div>
        <button
          className="school-button"
          ref={addButton}
          type="button"
          disabled={busy || (!networkView && !snapshot.networks.length)}
          onClick={() => edit(networkView ? { type: "network" } : { type: "ap" })}
        >
          <Plus size={17} aria-hidden="true" />
          {networkView ? "네트워크 등록" : "AP 등록"}
        </button>
      </header>
      <div className="school-meta">
        <span>설정 버전 {snapshot.version}</span>
        <span>
          {networkView
            ? `네트워크 ${snapshot.networks.length}개`
            : `AP ${snapshot.accessPoints.length}개 · 위치 미등록 ${snapshot.accessPoints.filter((a) => !a.locationRegistered).length}개`}
        </span>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
          새로고침
        </button>
      </div>
      <p className="school-message success" role="status" aria-live="polite">
        {notice}
      </p>
      {error ? (
        <div className="school-message error" role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            최신 정보 불러오기
          </button>
          <a href="/sign-in">로그인 확인</a>
        </div>
      ) : null}
      <div ref={editorAnchor} tabIndex={-1} className="school-editor-anchor">
        {editor?.type === "network" ? (
          <NetworkEditor
            key={editor.value?.id || "new-network"}
            network={editor.value}
            busy={busy}
            onCancel={closeEditor}
            onSubmit={(payload) =>
              save(
                `networks${editor.value ? `/${editor.value.id}` : ""}`,
                payload,
                Boolean(editor.value),
              )
            }
          />
        ) : editor?.type === "ap" ? (
          <AccessPointEditor
            key={editor.value?.id || "new-ap"}
            point={editor.value}
            networks={snapshot.networks}
            busy={busy}
            onCancel={closeEditor}
            onSubmit={(payload) =>
              save(
                `access-points${editor.value ? `/${editor.value.id}` : ""}`,
                payload,
                Boolean(editor.value),
              )
            }
          />
        ) : null}
      </div>
      {!networkView && !snapshot.networks.length ? (
        <p className="school-inline-note">
          AP를 등록하려면 먼저 <a href="/admin/networks">네트워크를 등록</a>해주세요.
        </p>
      ) : null}
      <div className="school-filters">
        <label className="school-search">
          <Search size={17} aria-hidden="true" />
          <span className="school-sr-only">
            {networkView ? "이름 또는 SSID 검색" : "AP 이름·BSSID·장소·SSID 검색"}
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={networkView ? "이름 또는 SSID 검색" : "이름, BSSID, 장소 검색"}
          />
        </label>
        {!networkView ? (
          <>
            <label>
              <span className="school-sr-only">건물</span>
              <select
                value={building}
                onChange={(e) => {
                  setBuilding(e.target.value);
                  setFloor("");
                }}
              >
                <option value="">모든 건물</option>
                {buildings.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="school-sr-only">층</span>
              <select value={floor} onChange={(e) => setFloor(e.target.value)}>
                <option value="">모든 층</option>
                {floors.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="school-checkbox">
              <input
                type="checkbox"
                checked={missing}
                onChange={(e) => setMissing(e.target.checked)}
              />
              위치 미등록만
            </label>
          </>
        ) : null}
      </div>
      <div className="school-list-heading">
        <h2>{networkView ? "등록 네트워크" : "전체 AP"}</h2>
        <span>{networkView ? networks.length : points.length}개 표시</span>
      </div>
      {(networkView ? networks.length : points.length) === 0 ? (
        <div className="school-empty">
          {networkView ? (
            <Radio size={28} aria-hidden="true" />
          ) : (
            <MapPin size={28} aria-hidden="true" />
          )}
          <h3>
            {query || building || floor || missing
              ? "조건에 맞는 항목이 없습니다."
              : networkView
                ? "등록한 네트워크가 없습니다."
                : "등록한 AP가 없습니다."}
          </h3>
          <p>
            {query || building || floor || missing
              ? "검색어나 필터를 바꿔보세요."
              : networkView
                ? "정확한 Wi-Fi 이름과 연결 정보를 추가해주세요."
                : "AP를 등록하면 여기에 설치 위치가 표시됩니다."}
          </p>
        </div>
      ) : networkView ? (
        <ul className="school-list" aria-label="등록 네트워크">
          {networks.map((n) => (
            <li key={n.id} className="school-network-row">
              <div className="school-record-name">
                <strong>{n.name}</strong>
                <span className="school-ssid">{n.ssid}</span>
              </div>
              <div className="school-record-details">
                <span>{securityOptions.find((s) => s.value === n.security)?.label}</span>
                <span>
                  AP {n.apCount}개 · {n.hasPassword ? "암호 저장됨" : "암호 없음"}
                </span>
              </div>
              <span className={`school-state ${n.enabled ? "active" : ""}`}>
                {n.enabled ? "사용" : "사용 중지"}
              </span>
              <div className="school-row-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit({ type: "network", value: n })}
                  aria-label={`${n.name} 수정`}
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(`networks/${n.id}`, networkInput(n), true)}
                  aria-label={`${n.name} ${n.enabled ? "사용 중지" : "다시 사용"}`}
                >
                  {n.enabled ? "사용 중지" : "다시 사용"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="school-list" aria-label="전체 AP">
          {points.map((a) => (
            <li key={a.id} className="school-ap-row">
              <div className="school-record-name">
                <strong>{a.name}</strong>
                <span>{networkById.get(a.networkId)?.name}</span>
                <code>{a.bssid}</code>
                {a.extraBssids.length > 0 && <span>외 BSSID {a.extraBssids.length}개</span>}
              </div>
              <div className="school-location">
                <span>{[a.building, a.floor].filter(Boolean).join(" · ") || "위치 미등록"}</span>
                {a.place ? <strong>{a.place}</strong> : null}
                {!a.locationRegistered && (a.building || a.floor || a.place) ? (
                  <small>위치 정보 일부 미등록</small>
                ) : null}
              </div>
              <span className={`school-state ${a.effectiveEnabled ? "active" : ""}`}>
                {!a.enabled ? "사용 중지" : !a.effectiveEnabled ? "네트워크 중지" : "사용"}
              </span>
              <div className="school-row-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit({ type: "ap", value: a })}
                  aria-label={`${a.name} 수정`}
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(`access-points/${a.id}`, pointInput(a), true)}
                  aria-label={`${a.name} ${a.enabled ? "사용 중지" : "다시 사용"}`}
                >
                  {a.enabled ? "사용 중지" : "다시 사용"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="school-footnote">
        {networkView
          ? "비밀번호는 암호화해 저장하며 조회 화면에 다시 표시하지 않습니다. 실제 기기 설정 배포는 아직 연결 전입니다."
          : "이 목록은 등록된 설치 위치입니다. AP의 실시간 접속 상태나 학생의 현재 위치를 나타내지 않습니다."}
      </p>
    </div>
  );
}
