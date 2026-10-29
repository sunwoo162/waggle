import type { Metadata } from "next";
import { SchoolManager } from "@/components/school/manager";
import { SchoolSetupNotice } from "@/components/school/setup-notice";
import { requireAdmin } from "@/server/auth/guard";
import { getSchoolState } from "@/server/school/runtime";
export const metadata: Metadata = { title: "네트워크" };
export default async function NetworksPage() {
  await requireAdmin();
  const state = getSchoolState();
  return state.ready ? (
    <SchoolManager initial={state.snapshot} view="networks" />
  ) : (
    <SchoolSetupNotice />
  );
}
