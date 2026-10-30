"use client";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CharacterSnapshot } from "../../shared/encyclopedia";
import { CharacterEditor } from "./editor";
import { CharacterPicture } from "./preview";

export function CharacterManager({ initial }: { initial: CharacterSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(initial.characters[0]?.id);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const character = snapshot.characters.find((c) => c.id === selected);
  const filtered = snapshot.characters.filter((c) =>
    `${c.name} ${c.apName} ${c.ssid}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/characters", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("refresh_failed");
      const next: CharacterSnapshot = await response.json();
      setSnapshot(next);
      if (!next.characters.some((c) => c.id === selected)) setSelected(next.characters[0]?.id);
      setNotice("최신 목록을 불러왔습니다.");
    } catch {
      setError("목록을 불러오지 못했습니다. 로그인과 서버 상태를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function save(input: Record<string, unknown>) {
    if (busy || !character) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/characters/${character.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "저장하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      setSnapshot(result);
      setNotice("캐릭터를 저장했습니다.");
    } catch {
      setError("저장 결과를 확인하지 못했습니다. 새로 불러오기로 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="school-page character-page">
      <header className="school-heading">
        <div>
          <h1>도감 관리</h1>
          <p>AP마다 한 명씩, 와글의 친구들을 꾸며주세요.</p>
        </div>
        <button
          type="button"
          className="school-button secondary"
          disabled={busy}
          onClick={() => void refresh()}
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
      {!snapshot.characters.length ? (
        <div className="character-empty">
          <Sparkles size={32} aria-hidden="true" />
          <h2>첫 친구를 기다리는 중</h2>
          <p>AP를 등록하면 캐릭터가 하나씩 생겨요.</p>
          <Link href="/admin/access-points" className="school-button">
            AP 등록하러 가기
          </Link>
        </div>
      ) : (
        <div className="character-workspace">
          <aside className="character-list" aria-label="편집할 캐릭터">
            <label className="character-search" htmlFor="character-search">
              <Search size={16} aria-hidden="true" />
              <input
                id="character-search"
                type="search"
                placeholder="별명, AP, Wi-Fi 이름 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <p className="character-list-count">
              전체 {snapshot.characters.length}명 · 검색 {filtered.length}명
            </p>
            <div className="character-list-items">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="character-list-item"
                  aria-pressed={selected === c.id}
                  disabled={busy}
                  onClick={() => {
                    setSelected(c.id);
                    setError("");
                    setNotice("");
                  }}
                >
                  <CharacterPicture src={c.imagePath} name={c.name} decorative />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.apName}</small>
                    {!c.enabled && <em>AP 비활성</em>}
                  </span>
                </button>
              ))}
              {!filtered.length && <p className="character-no-results">일치하는 친구가 없어요.</p>}
            </div>
          </aside>
          {character && (
            <CharacterEditor
              key={`${character.id}:${character.revision}`}
              character={character}
              busy={busy}
              onSave={save}
            />
          )}
        </div>
      )}
    </section>
  );
}
