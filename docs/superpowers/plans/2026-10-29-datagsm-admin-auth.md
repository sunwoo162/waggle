# DataGSM 운영자 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 와글 관리자 웹에 DataGSM PKCE 로그인과 서버 권한 검사, 영속 세션·로그아웃을 추가한다.

**Architecture:** Better Auth의 Generic OAuth·state·PKCE·쿠키·CSRF 검증을 사용한다. DataGSM의 JSON 토큰 교환과 사용자 정보만 별도 어댑터로 연결하고, 서버가 인증한 고유 ID를 사전 지정 운영자 ID와 비교한다. 초기 단일 Node 서버는 better-sqlite3에 세션을 보관한다. 설정이 없으면 로그인·관리 API를 닫고 설정 안내를 제공한다.

**Tech Stack:** Next.js 16.4.3, TypeScript, Better Auth 1.7.14, better-sqlite3 13.0.3, Node 22, tsx test runner.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md, ../../product/project-planning.md, GitHub issue #2. 사용자는 #8 이후 개발 진행을 지시했고 DataGSM 클라이언트가 아직 없다고 답했다.

## Global Constraints

- 운영자는 한 명이며 DataGSM role ADMIN으로 권한을 얻지 않는다.
- 공급자 사용자 고유 ID와 내부 사용자 ID를 구분한다. 이메일·이름으로 계정을 자동 연결하지 않는다.
- DataGSM 계정 비밀번호를 와글에서 입력받지 않는다. 토큰·비밀값·사용자 상세 정보를 로그에 쓰지 않는다.
- 현재 범위는 관리자 웹 인증이다. 네이티브 앱 로그인 복귀·이메일·개인 코드·Wi-Fi 연결은 후속 작업이다. #2는 이 PR만으로 닫지 않는다.
- 클라이언트 등록과 실제 사람 계정 로그인은 이번 자동 검증에 포함하지 않는다. 테스트의 합성 사용자와 mock provider를 실제 연동으로 표시하지 않는다.
- PKCE의 code_verifier는 서버 인증 시도에 묶고 S256을 사용한다. 토큰 교환은 DataGSM 공식 JSON 계약을 따른다.
- 기존 기획 문서는 공개 자료로 유지하되 /admin 및 /api/admin은 인증 없이 열리지 않는다.

## Review Focus

1. 신규·기존 계정 모두 잘못된 운영자 ID, PENDING, 변조·누락된 세션으로 관리자 권한을 얻지 않아야 한다.
2. state 누락·변조·재사용과 외부 callbackURL·Origin이 거부돼야 한다.
3. DataGSM의 API 응답·토큰·실패 원문이 브라우저나 로그로 새지 않아야 한다.
4. 새 환경·설정 없음·SQLite 스키마 없음·만료·로그아웃 후 상태를 정확히 구분해야 한다.
5. Next.js의 병렬 페이지 렌더링 때문에 layout만 믿고 페이지/API 검사를 생략하지 않아야 한다.

## 파일과 책임

- apps/admin/src/server/auth/config.ts: 비밀값을 노출하지 않는 환경 검증.
- apps/admin/src/server/auth/datagsm.ts: 고정된 제공자 URL, JSON 교환·신선한 사용자 정보·최소 프로필.
- apps/admin/src/server/auth/factory.ts: Better Auth 옵션과 검증 정책, DB migration 진입점.
- apps/admin/src/server/auth/runtime.ts: 로컬 DB·서버 인스턴스의 지연 초기화.
- apps/admin/src/server/auth/access.ts: 검증된 세션과 DataGSM 계정의 운영자 판정.
- apps/admin/src/server/auth/guard.ts: Next headers/redirect와 공통 서버 가드.
- apps/admin/src/app/api/auth/[...all]/route.ts: 필요한 로그인·콜백·로그아웃 엔드포인트만 노출.
- apps/admin/src/app/api/admin/session/route.ts: 인증된 운영자 식별 확인, 401·403·503.
- apps/admin/src/app/sign-in/: BASE 로그인·설정 없음·실패 화면.
- apps/admin/src/components/auth/: 로그인·로그아웃 상호작용.
- scripts/setup-auth.mjs: 기존 파일을 덮어쓰지 않는 로컬 환경 파일 준비.
- apps/admin/scripts/migrate-auth.ts: 명시적 세션 스키마 준비.
- tests/auth-policy.test.ts, tests/auth-flow.test.ts, tests/auth-setup.test.mjs: 정책·실제 라이브러리 흐름·설정 보호.
- docs/development/datagsm-auth.md: 등록·설정·검증 범위와 단일 서버 저장 조건.

### Task 1: 환경·프로필·권한 정책

**Interfaces:** readAuthConfig(env) → ready/settings 또는 missing/errors(값 없음). parseDataGsmProfile(input) → 최소 id/email/name/status. isEligibleStudent(input) → boolean. isOperatorSubject(subject, configuredId) → boolean. initializeAuthEnv(file) → created:boolean.

- [ ] 누락·짧은 secret·비 HTTPS 운영 URL·경로 포함 URL·잘못된 ID를 거부하고 loopback 개발 URL을 허용하는 테스트를 쓴다.
- [ ] 잘못된 프로필·안전하지 않은 숫자 ID·PENDING·졸업/자퇴/정보 누락 거부, 다른 계정의 ADMIN 불허, 추가 개인정보 제거 테스트의 실패를 확인한다.
- [ ] 환경·정책 모듈과 기존 환경 파일을 보존하는 준비 명령을 구현한다.
- [ ] 해당 테스트 통과 후 `feat(auth): 운영자 인증 설정과 DataGSM 정책 추가`로 커밋한다.

### Task 2: 실제 Better Auth 흐름과 세션

**Interfaces:** createDataGsmAuth({settings,database,fetcher?}) → BetterAuth instance. migrateAuth(options) → Promise<void>. authorizeAdmin(auth,database,headers,operatorSubject) → access result.

- [ ] SQLite 메모리 DB와 합성 제공자로 실제 Better Auth handler를 호출하는 테스트를 먼저 작성하고 실패를 확인한다.
- [ ] 인증 URL의 state·S256, JSON 토큰 교환·code_verifier·고정 userinfo URL을 검증한다.
- [ ] 운영자 성공·다른 ADMIN 거부·PENDING 거부·state 변조/재사용·외부 redirect/Origin 거부를 검증한다.
- [ ] DB 세션 재조회·새 인스턴스에서 재사용·만료·로그아웃·서버 운영자 설정 변경 후 차단을 검증한다.
- [ ] 제공자 토큰은 암호화 저장하고 계정 자동 연결·불필요한 공개 엔드포인트·쿠키 세션 캐시는 끈다. 활성 세션은 요청마다 DB에서 확인한다.
- [ ] 테스트 통과 후 `feat(auth): DataGSM PKCE와 영속 운영자 세션 연결`로 커밋한다.

### Task 3: 관리자 경계·로그인 UI·설정 안내

**Interfaces:** getAdminAccess(headers) → unconfigured/unavailable/unauthenticated/forbidden/authorized. 페이지·layout·API에서 같은 판정을 사용한다. /api/auth는 POST sign-in/social, GET callback/datagsm, POST sign-out만 허용한다.

- [ ] API의 설정 없음 503·미인증 401·일반 계정 403·운영자 200 및 허용되지 않은 auth path/method 검사를 추가한다.
- [ ] 지연 DB 초기화와 명시적 migration 명령, 서버 가드·새 로그인 화면·로그아웃을 구현한다.
- [ ] /admin layout과 각 페이지에서 모두 검사한다. 민감한 데이터를 layout 경계만으로 보호하지 않는다.
- [ ] 문서와 README에 http://127.0.0.1:3000/api/auth/callback/datagsm 등록 주소, 필요한 환경 이름, 실제 연동 대기를 기록한다. 실제 배포에는 HTTPS 콜백과 영속 DB 디스크가 필요하다.
- [ ] `npm run check`, `npm run build`, 브라우저의 미로그인 리다이렉트·설정 없음·작은 화면 확인을 완료한다.
- [ ] 독립 코드 리뷰 후 주요 발견을 재현 테스트로 수정하고 `feat(auth): 관리자 로그인 화면과 서버 접근 가드 추가`로 커밋한다.
- [ ] #2를 참조하는 PR을 생성·연결하고 최신 커밋의 CI 결과를 확인한다. 실제 DataGSM 로그인은 클라이언트 등록 후 사용자 계정으로 별도 확인한다.

## 구현 판단

기존 명세의 기술 선택 위임과 사용자 개발 지시를 적용해 다시 승인 질문을 반복하지 않는다. Better Auth는 표준 인증 경계를 담당하고 DataGSM 비표준 JSON 계약만 어댑터로 둔다. SQLite는 로컬·단일 영속 Node 서버용이며 다중 서버·일회성 파일 시스템 배포용으로 간주하지 않는다. native handoff·학생 이메일/코드는 별도 기능 경계를 유지한다.
