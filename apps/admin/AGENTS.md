# 관리자 웹

루트 AGENTS.md를 먼저 따른다. Next.js App Router·TypeScript, BASE 토큰, React Server Components를 기본으로 사용한다. 이벤트·브라우저 상태가 필요한 작은 컴포넌트만 client로 만든다.

- src/app은 라우트·메타데이터·레이아웃, src/components는 화면 구성, src/shared는 재사용되는 토큰·자료다.
- 운영 데이터 쓰기는 인증된 서버 경로에서만 수행한다. /admin layout과 각 페이지는 requireAdmin을 호출하고 모든 관리 API는 getAdminAccess 판정을 적용한다. layout 경계만으로 페이지 데이터를 보호하지 않는다.
- 현재 DataGSM 운영자 인증 코드와 영속 세션이 있으며 실제 클라이언트 등록·사람 계정 검증은 대기 중이다. 초기 SQLite는 단일 영속 Node 서버용이며 .env와 DB를 빌드 출력에 포함하지 않는다.
- 새 화면은 빈 상태·권한 오류·로딩·저장 실패 중 해당 상태를 설계한다. 예시 데이터를 실제 AP·사용자 통계처럼 표시하지 않는다.
- 네트워크·사용자·도감 기능이 미구현이면 준비 중으로 표시하고 동작하지 않는 버튼을 만들지 않는다.
- 정적 문서는 npm run docs:prepare가 만든 공개 자료만 읽는다. 서버 파일의 임의 경로를 입력받아 열지 않는다.
- `npm run check`, `npm run build` 및 실제 화면으로 검증한다. 외부 폰트·데이터가 없어도 빌드돼야 한다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
