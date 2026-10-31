export type Character = { id: string; name: string; description: string; imagePath: string | null };
export type Encyclopedia = { schemaVersion: 1; version: number; characters: Character[] };
export type ManagedCharacter = Character & {
  apName: string;
  ssid: string;
  enabled: boolean;
  /** Shown and collectable in apps: active AP with both a saved name and art. */
  published: boolean;
  revision: number;
};
export type CharacterSnapshot = { version: number; characters: ManagedCharacter[] };
export type Collection = { schemaVersion: 1; apIds: string[] };
