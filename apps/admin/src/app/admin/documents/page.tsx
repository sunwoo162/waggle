import { ArrowUpRight, BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guard";

export const metadata: Metadata = { title: "프로젝트 문서" };
const sections = new Set([
  "home",
  "overview",
  "features",
  "policies",
  "architecture",
  "api",
  "screens",
  "design",
  "validation",
  "roadmap",
  "operations",
  "decisions",
  "research",
  "resources",
]);

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const section =
    typeof params.section === "string" && sections.has(params.section) ? params.section : "home";
  const source = `/project-docs/handbook/index.html#${section}`;
  return (
    <div className="documents-page">
      <div className="documents-heading">
        <div>
          <div className="eyebrow">PROJECT HANDBOOK</div>
          <h1>
            <BookOpen size={25} aria-hidden="true" />
            프로젝트 문서
          </h1>
          <p>기획부터 설계·검증·운영 준비까지, 와글의 기준을 모았어요.</p>
        </div>
        <a className="secondary-button" href={source} target="_blank" rel="noreferrer">
          넓게 보기
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <div className="document-viewer">
        <iframe key={section} src={source} title="와글 프로젝트 문서 허브" />
      </div>
    </div>
  );
}
