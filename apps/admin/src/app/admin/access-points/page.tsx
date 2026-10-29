import type { Metadata } from "next";
import { SchoolManager } from "@/components/school/manager";
import { SchoolSetupNotice } from "@/components/school/setup-notice";
import { requireAdmin } from "@/server/auth/guard";
import { getSchoolState } from "@/server/school/runtime";
export const metadata: Metadata = { title: "AP 위치" };
export default async function AccessPointsPage() {
  await requireAdmin();
  const state = getSchoolState();
  return state.ready ? (
    <SchoolManager initial={state.snapshot} view="access-points" />
  ) : (
    <SchoolSetupNotice />
  );
}
