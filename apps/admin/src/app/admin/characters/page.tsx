import type { Metadata } from "next";
import { CharacterManager } from "@/components/characters/manager";
import { SchoolSetupNotice } from "@/components/school/setup-notice";
import { requireAdmin } from "@/server/auth/guard";
import { getSchoolStore } from "@/server/school/runtime";
import type { CharacterSnapshot } from "@/shared/encyclopedia";

export const metadata: Metadata = { title: "도감 관리" };
export default async function CharactersPage() {
  await requireAdmin();
  let snapshot: CharacterSnapshot;
  try {
    snapshot = getSchoolStore().characters.snapshot();
  } catch {
    return <SchoolSetupNotice />;
  }
  return <CharacterManager initial={snapshot} />;
}
