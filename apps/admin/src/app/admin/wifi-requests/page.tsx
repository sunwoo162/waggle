import type { Metadata } from "next";
import { WifiRequestInbox } from "@/components/school/request-inbox";
import { SchoolSetupNotice } from "@/components/school/setup-notice";
import { requireAdmin } from "@/server/auth/guard";
import { getSchoolStore } from "@/server/school/runtime";
import type { WifiRequestItem } from "@/shared/wifi-request";

export const metadata: Metadata = { title: "등록 요청" };
export default async function WifiRequestsPage() {
  await requireAdmin();
  let requests: WifiRequestItem[];
  try {
    requests = getSchoolStore().wifiRequests();
  } catch {
    return <SchoolSetupNotice />;
  }
  return <WifiRequestInbox initial={requests} />;
}
