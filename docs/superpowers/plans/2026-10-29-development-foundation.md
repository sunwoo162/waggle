# 와글 개발 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 공개 GitHub 저장소의 협업 흐름과 재현 가능한 검사 명령을 만들고, 기존 프로젝트 문서를 관리자 웹에서 읽을 수 있게 한다.

**Architecture:** 한 저장소에 apps/admin, 향후 apps/android와 apps/windows를 구분한다. 첫 PR은 개발 하네스와 Next.js 관리자 문서 진입점까지 다룬다. 실제 인증·접속정보 저장·기기 연결은 독립 후속 이슈로 진행한다.

**Tech Stack:** Node.js 22, npm workspaces, Next.js 16.4.3, React 19.3.1, TypeScript, Biome, Node test runner, Python 3.11+ 문서 빌더.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md 및 ../../product/project-planning.md. 사용자가 2026-10-29 개발 시작·관리자 문서 메뉴·공개 저장소·와글 이름·워셔 참고 하네스를 추가 승인했다.

## Global Constraints

- Android Kotlin, Windows C#, 운영자 한 명, BASE 디자인 시스템.
- 실제 연결 성공만 도감 해금이며 스캔·요청·실패는 해금하지 않는다.
- 학교 비밀번호·개인 코드·토큰·학생 정보는 저장소와 예시 데이터에 넣지 않는다.
- 현재 첫 PR에는 인증과 운영 데이터가 없다. 첫 관리자 화면은 개발 시작 화면임을 명시한다.
- 기기 간 도감 공유 등 미확정 제품 제안을 이번 기반 PR에서 확정하지 않는다.
- main 직접 작업 대신 작업 브랜치와 PR을 사용한다. 최초 저장소 시작 커밋만 예외다.

## Review Focus

1. 새 개발자의 clone·npm ci·문서 생성·빌드에 로컬 절대 경로나 Codex 런타임이 필요하지 않아야 한다.
2. 생성 문서에서 허용된 문서만 서비스하고 비밀 파일·테스트 출력·심볼릭 링크는 복사하지 않는다.
3. 문서의 원문 링크·34개 화면·해시 목차가 복사 후에도 유효해야 한다.
4. 관리자 화면이 가짜 운영 수치나 실제 인증 완료를 표시하지 않아야 한다.
5. 저장소 검사·커밋 규칙·필수 CI가 Windows와 Linux에서 같은 정책을 적용해야 한다.

## 작업 경계와 파일

- AGENTS.md, CONTRIBUTING.md, docs/development/: 사람이 읽는 작업 규칙과 플랫폼 경계.
- .github/: 이슈·PR 템플릿, CI, 의존성 점검.
- .githooks/, scripts/: 커밋 규칙·비밀값 검사·문서 복사·검증.
- package.json, biome.json, .editorconfig, .gitattributes: 도구 버전·명령·일관된 저장 형식.
- docs/handbook/: 기존 문서 원본과 생성 결과. 환경 독립적인 빌드로 수정.
- apps/admin/: BASE 관리자 레이아웃, 시작 화면, 문서 화면.
- apps/android/README.md, apps/windows/README.md: 지원 언어와 다음 검증 범위. 앱이 구현됐다고 표시하지 않음.

### Task 1: 협업 하네스와 저장소 검사

**Files:** AGENTS.md, CONTRIBUTING.md, .github/_, .githooks/_, scripts/check-repo.mjs, scripts/setup.mjs, tests/repository.test.mjs, package.json, biome.json, docs/development/*.

**Interfaces:** findRepositoryProblems(files: Array<{path:string, content:string}>): string[]와 verifyCommitMessage(message:string): boolean. CLI는 실패 시 nonzero, 성공 시 검사 수를 출력한다.

- [x] Step 1: 비밀 파일 경로·토큰·개인키 차단과 일반 예시 허용, Conventional Commit·merge/revert 메시지 검증 테스트를 작성한다.
- [x] Step 2: node --test tests/repository.test.mjs 실패를 확인한다.
- [x] Step 3: 검사·로컬 훅·워크플로·기여 규칙을 구현한다. 훅 설치는 npm run setup으로 명시적으로 수행한다.
- [x] Step 4: 테스트와 npm run check:repo를 실행한다. Expected: 모두 통과.
- [x] Step 5: chore: 협업 하네스와 GitHub 검사 기반 구성 커밋.

### Task 2: 문서 이식성과 안전한 관리자 배포 자료

**Files:** docs/handbook/build_handbook.py, render-markdown.mjs, template.html, scripts/prepare-docs.mjs, scripts/check-docs.mjs, tests/documents.test.mjs, 기존 기획 문서.

**Interfaces:** prepareDocs(sourceRoot:string, outputRoot:string): Promise<{copied:number}>. 복사 대상은 프로젝트 문서 allowlist이며 Markdown·HTML·PNG만 허용한다. 출력은 public/project-docs 전용이며 원본의 허용 목록과 대조해 폐기된 출력도 정리한다. 문서 링크 검사는 복사된 문서 트리를 입력받는다.

- [x] Step 1: 문서와 자산 복사, 비밀·코드·QA 자료 제외, 원본 없음 오류의 테스트를 작성한다.
- [x] Step 2: node --test tests/documents.test.mjs 실패를 확인한다.
- [x] Step 3: 로컬 절대 경로를 제거하고 npm 설치된 marked, PATH의 node/Python을 사용한다. 와글 이름과 승인된 개발 시작 상태를 반영한다.
- [x] Step 4: npm run docs:build, npm run docs:check와 테스트를 실행한다. Expected: 13개 문서·34개 화면·모든 내부 링크 유효.
- [x] Step 5: docs: 와글 기획 문서와 이식 가능한 문서 빌드 추가 커밋.

### Task 3: 관리자 웹의 프로젝트 문서 메뉴

**Files:** apps/admin/package.json, tsconfig.json, next.config.ts, src/app/_, src/components/_, src/shared/*, apps/android/README.md, apps/windows/README.md, README.md.

**Interfaces:** /admin은 실제 현재 개발 상태·기획 진입점을 제공한다. /admin/documents는 /project-docs/handbook/index.html을 문서 뷰어로 연다. 실제 네트워크·AP·사용자 관리 API는 제공하지 않는다.

- [x] Step 1: Next.js App Router 관리자 기본 화면과 프로젝트 문서 메뉴를 구현한다. 화면은 낮은 위험의 표현 변경이므로 유사한 구현 복제 테스트 대신 실제 브라우저로 확인한다.
- [x] Step 2: npm run check, npm run build 실행. Expected: 테스트·저장소/문서·Biome·타입 검사 및 production build 통과.
- [x] Step 3: 브라우저에서 시작 화면→문서 메뉴→기능명세→도감 해금 항목을 확인하고 작은 화면도 확인한다.
- [x] Step 4: feat(admin): 관리자 기본 화면과 프로젝트 문서 메뉴 추가 커밋.
- [x] Step 5: 독립 코드 리뷰 후 필요한 수정을 검증하고 PR을 생성·연결한다. CI 결과와 남은 외부 조건을 기록한다.

## 후속 PR

운영자 DataGSM 인증 → 암호화된 네트워크/AP 관리 → 개인 코드·기기 세션 → Windows 검색·연결 검증 → Android 제안·백그라운드 검증 → 실제 연결 기반 도감. 각 단계는 이슈의 완료 조건과 확인된 플랫폼 범위를 기준으로 나눈다.

## 계획 판단

사용자의 개발 시작 지시를 구현 승인으로 적용한다. 공개 저장소 생성과 이름은 별도 답변으로 확정됐다. 현재 저장소가 새로 생성됐으므로 기존 작업과 충돌하지 않는 chore/development-foundation 브랜치에서 진행한다. 운영 배포는 이번 지시에 포함하지 않는다.
