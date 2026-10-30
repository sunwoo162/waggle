import { Ghost } from "lucide-react";
import Image from "next/image";

export function CharacterPicture({
  src,
  name,
  undiscovered = false,
  decorative = false,
}: {
  src: string | null;
  name: string;
  undiscovered?: boolean;
  decorative?: boolean;
}) {
  return (
    <div
      className={`character-picture${undiscovered ? " undiscovered" : ""}`}
      aria-hidden={decorative || undefined}
    >
      {src ? (
        <Image
          src={src}
          alt={undiscovered ? "미발견 캐릭터" : name}
          width={192}
          height={192}
          unoptimized
        />
      ) : (
        <Ghost size={64} strokeWidth={1.3} aria-hidden="true" />
      )}
      {!src && <span>{undiscovered ? "미발견" : "그림을 기다려요"}</span>}
    </div>
  );
}
