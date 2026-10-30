"use client";
import { ImagePlus, Save, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ManagedCharacter } from "../../shared/encyclopedia";
import { CharacterPicture } from "./preview";

export function CharacterEditor({
  character,
  busy,
  onSave,
}: {
  character: ManagedCharacter;
  busy: boolean;
  onSave: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const [image, setImage] = useState<{ mime: string; base64: string } | null | undefined>();
  const [preview, setPreview] = useState(character.imagePath);
  const [imageError, setImageError] = useState("");
  const [reading, setReading] = useState(false);
  function selectFile(file?: File) {
    setImageError("");
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setImageError("PNG·JPEG·WebP 그림을 2MB 이하로 골라주세요.");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setReading(false);
      setImageError("그림을 읽지 못했습니다. 파일을 다시 골라주세요.");
    };
    reader.onload = () => {
      setReading(false);
      if (typeof reader.result !== "string") {
        setImageError("그림을 읽지 못했습니다.");
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        setImageError("그림을 읽지 못했습니다.");
        return;
      }
      setPreview(reader.result);
      setImage({ mime: file.type, base64 });
    };
    reader.readAsDataURL(file);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reading) return;
    void onSave({
      name,
      description,
      revision: character.revision,
      ...(image !== undefined ? { image } : {}),
    });
  }
  return (
    <form className="character-editor" onSubmit={submit} aria-labelledby="character-editor-title">
      <div className="character-editor-heading">
        <div>
          <span className="character-caption">캐릭터 편집</span>
          <h2 id="character-editor-title">{character.apName}</h2>
        </div>
        <span className="school-status">{character.enabled ? "앱에 표시 중" : "AP 비활성"}</span>
      </div>
      <fieldset disabled={busy || reading}>
        <div className="character-preview-pair">
          <div>
            <CharacterPicture src={preview} name={name} />
            <strong>{name || "이름 없는 친구"}</strong>
            <span>발견 후</span>
          </div>
          <div>
            <CharacterPicture src={preview} name={name} undiscovered />
            <strong>???</strong>
            <span>미발견</span>
          </div>
        </div>
        <div className="character-image-actions">
          <label className="school-button secondary" htmlFor="character-image">
            <ImagePlus size={16} aria-hidden="true" />
            그림 선택
          </label>
          <input
            id="character-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="character-file"
            aria-describedby="character-image-help"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              selectFile(file);
            }}
          />
          {preview && (
            <button
              type="button"
              className="character-remove"
              onClick={() => {
                setPreview(null);
                setImage(null);
                setImageError("");
              }}
            >
              <X size={14} aria-hidden="true" />
              그림 제거
            </button>
          )}
        </div>
        <p id="character-image-help" className="character-hint">
          PNG·JPEG·WebP, 2MB·2048px 이내. 공개해도 되는 캐릭터 그림만 올려주세요.
        </p>
        <p className="school-message error" role="alert">
          {imageError}
        </p>
        <label className="character-field" htmlFor="character-name">
          별명
          <input
            id="character-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            placeholder="예: 쉿파이"
          />
        </label>
        <label className="character-field" htmlFor="character-description">
          짧은 소개
          <textarea
            id="character-description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="이 친구는 어떤 친구인가요?"
          />
          <small>{description.length} / 300</small>
        </label>
        <p className="character-hint">
          실제 연결에 성공하면 이 친구를 만나요. 설치 위치는 AP 위치 메뉴에서 관리해요.
        </p>
        <div className="character-save-row">
          <span>{reading ? "그림 읽는 중…" : `수정 버전 ${character.revision}`}</span>
          <button type="submit" className="school-button">
            <Save size={16} aria-hidden="true" />
            {busy ? "저장 중…" : "변경 저장"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
