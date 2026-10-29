"use client";
import { type FormEvent, useState } from "react";
import { type AccessPoint, type Network, securityOptions } from "../../shared/school";

type Submit = (payload: Record<string, unknown>) => Promise<void>;
export function NetworkEditor({
  network,
  busy,
  onSubmit,
  onCancel,
}: {
  network?: Network;
  busy: boolean;
  onSubmit: Submit;
  onCancel: () => void;
}) {
  const [security, setSecurity] = useState(network?.security || "wpa2-personal");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    void onSubmit({
      name: fd.get("name"),
      ssid: fd.get("ssid"),
      security,
      password: fd.get("password") || "",
      enabled: fd.has("enabled"),
      ...(network ? { revision: network.revision } : {}),
    });
  }
  return (
    <form onSubmit={submit} className="school-editor" aria-labelledby="editor-title">
      <h2 id="editor-title">{network ? "네트워크 수정" : "네트워크 등록"}</h2>
      <fieldset disabled={busy}>
        <div className="school-fields">
          <label htmlFor="network-name">
            관리 이름
            <input
              id="network-name"
              name="name"
              required
              maxLength={80}
              defaultValue={network?.name}
              placeholder="관리할 때 구분하기 쉬운 이름"
            />
          </label>
          <label htmlFor="network-ssid">
            Wi-Fi 이름 (SSID)
            <input
              id="network-ssid"
              name="ssid"
              required
              maxLength={32}
              defaultValue={network?.ssid}
              autoComplete="off"
              aria-describedby="ssid-help"
            />
            <small id="ssid-help">최대 32바이트. 이름 앞뒤의 공백도 포함합니다.</small>
          </label>
          <label htmlFor="network-security">
            보안 방식
            <select
              id="network-security"
              name="security"
              value={security}
              onChange={(e) => setSecurity(e.target.value as typeof security)}
            >
              {securityOptions.map((s) => (
                <option value={s.value} key={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {security !== "open" ? (
            <label htmlFor="network-password">
              {network?.hasPassword ? "새 비밀번호" : "비밀번호"}
              <input
                type="password"
                id="network-password"
                name="password"
                autoComplete="new-password"
                required={!network?.hasPassword || network.security !== security}
                minLength={8}
                maxLength={security === "wpa2-personal" ? 64 : 63}
                aria-describedby="password-help"
              />
              <small id="password-help">
                {network?.hasPassword && network.security === security
                  ? "비워두면 기존 비밀번호를 유지합니다."
                  : "영문·숫자·기호 8~63자. WPA2는 64자리 16진수 키도 지원합니다."}
              </small>
            </label>
          ) : (
            <p className="school-field-note">OPEN은 비밀번호 없이 연결하는 네트워크입니다.</p>
          )}
        </div>
        <label className="school-checkbox">
          <input type="checkbox" name="enabled" defaultChecked={network?.enabled ?? true} />이
          네트워크 사용
        </label>
        <p className="school-form-note">사용을 중지해도 등록한 AP와 위치 정보는 남아 있습니다.</p>
        <div className="school-form-actions">
          <button type="button" className="school-button secondary" onClick={onCancel}>
            취소
          </button>
          <button type="submit" className="school-button">
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function AccessPointEditor({
  point,
  networks,
  busy,
  onSubmit,
  onCancel,
}: {
  point?: AccessPoint;
  networks: Network[];
  busy: boolean;
  onSubmit: Submit;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    void onSubmit({
      name: fd.get("name"),
      networkId: fd.get("networkId"),
      bssid: fd.get("bssid"),
      building: fd.get("building"),
      floor: fd.get("floor"),
      place: fd.get("place"),
      enabled: fd.has("enabled"),
      ...(point ? { revision: point.revision } : {}),
    });
  }
  return (
    <form onSubmit={submit} className="school-editor" aria-labelledby="editor-title">
      <h2 id="editor-title">{point ? "AP 수정" : "AP 등록"}</h2>
      <fieldset disabled={busy}>
        <div className="school-fields">
          <label htmlFor="ap-name">
            AP 이름
            <input
              id="ap-name"
              name="name"
              required
              maxLength={80}
              defaultValue={point?.name}
              placeholder="설치 장소를 알아보기 쉬운 이름"
            />
          </label>
          <label htmlFor="ap-network">
            연결 네트워크
            <select id="ap-network" name="networkId" defaultValue={point?.networkId || ""} required>
              <option value="" disabled>
                네트워크 선택
              </option>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · {n.ssid}
                  {n.enabled ? "" : " (사용 중지)"}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="ap-bssid">
            BSSID
            <input
              id="ap-bssid"
              name="bssid"
              required
              maxLength={17}
              defaultValue={point?.bssid}
              placeholder="00:00:00:00:00:00"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="bssid-help"
            />
            <small id="bssid-help">
              실제 AP의 무선 식별자입니다. 여러 BSSID는 각각 등록합니다.
            </small>
          </label>
          <div className="school-field-note">
            건물·층·설치 장소를 모두 입력하면 위치 등록이 완료됩니다. 모르는 항목은 비워둘 수
            있습니다.
          </div>
          <label htmlFor="ap-building">
            건물 <span>(선택)</span>
            <input id="ap-building" name="building" maxLength={80} defaultValue={point?.building} />
          </label>
          <label htmlFor="ap-floor">
            층 <span>(선택)</span>
            <input
              id="ap-floor"
              name="floor"
              maxLength={24}
              defaultValue={point?.floor}
              placeholder="예: 2층, 지하 1층"
            />
          </label>
          <label htmlFor="ap-place" className="school-field-wide">
            설치 장소 <span>(선택)</span>
            <input id="ap-place" name="place" maxLength={120} defaultValue={point?.place} />
          </label>
        </div>
        <label className="school-checkbox">
          <input type="checkbox" name="enabled" defaultChecked={point?.enabled ?? true} />이 AP 사용
        </label>
        <div className="school-form-actions">
          <button type="button" className="school-button secondary" onClick={onCancel}>
            취소
          </button>
          <button className="school-button" type="submit">
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
