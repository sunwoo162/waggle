# 개인 코드·기기 세션 Implementation Plan

> **For agentic workers:** superpowers:executing-plans로 직접 구현하고 마지막에 읽기 전용 리뷰 한 건을 수행한다. 기존 승인 기획과 계속 개발 지시를 적용한다.

**Goal:** 운영자가 사람별 개인 코드를 발급·회수·재발급하고 Android·Windows에 독립된 회수 가능 세션을 제공한다.

**Architecture:** 관리자 DataGSM 인증과 별도의 Better Auth 인스턴스·SQLite를 사용한다. 서버 전용 플러그인이 프레임워크의 자격증명 해시/검증, 사용자·세션 생성과 JWT 서명/검증을 담당한다. 공개 HTTP는 제한된 façade만 제공하고 라이브러리의 원래 인증 라우터는 노출하지 않는다.

**Tech Stack:** 기존 Next.js·Better Auth 1.7.14의 bearer/JWT·SQLite, Zod. 외부 서비스 추가 없음.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md §§개인 초대코드·세션, GitHub #4. 이메일 인증·DataGSM 네이티브 복귀는 이번 PR의 후속 부분이므로 #4를 닫지 않는다.

## 불변 조건과 구현 판단

- GSM 전용. 운영자가 발급하는 교내 이용자 항목마다 코드 하나. 초대코드만 입력하며 이메일·추가 비밀번호를 요구하지 않는다. 코드 소지가 실제 신원 증명은 아니다.
- 발급·재발급 응답에만 전체 코드. 일반 목록·재조회에는 검증값도 반환하지 않는다. 관리 UI는 메모리에만 일시 표시하고 숨기면 다시 조회하지 않는다.
- 코드는 임의 selector 64비트 + 비밀 192비트다. 비밀 검증값은 Better Auth의 password hash/verify로 저장·검증한다. 내부 프레임워크의 필수 email은 전달 불가능한 .invalid 내부 식별자이며 실제 이메일 소유 인증으로 표시하지 않는다.
- 사용자 이름·이메일 일치로 계정을 합치지 않는다. 관리자 인증 DB·쿠키와 별도이며 일반 사용자 토큰이 관리자 권한이 되지 않는다.
- 서비스 인증 secret은 BETTER_AUTH_SECRET에서 HKDF의 별도 문맥으로 파생한다. 코드·토큰·키를 로그/URL/커밋/스크린샷에 넣지 않는다.
- 액세스 JWT 15분, 기기 갱신 세션 절대 30일. 갱신은 기존 세션 포인터를 비교·교체하여 한 번만 성공하고 이전 토큰을 거부한다. 매 접근에 현재 코드 버전·회수·DB 세션을 다시 확인한다.
- 회수·재발급은 기존 모든 기기 세션을 차단한다. 기기 하나의 회수·로그아웃은 다른 기기를 유지한다. OS에 이미 저장한 Wi-Fi 암호를 무효화했다고 표시하지 않는다.
- 코드 로그인은 공통 120회/분, 등록 selector별 10회/5분(알 수 없는 값은 공통 버킷), 갱신은 120회/분 한도로 DB에 제한한다. 임의 전달 IP 헤더를 신뢰하지 않는다. 기기당 갱신 토큰을 직렬 갱신하는 클라이언트가 필요하다.
- 회원당 살아 있는 기기 세션은 최대 20개다. 기기 ID는 서버 발급이며 하드웨어 지문·이동 경로를 수집하지 않는다.
- 관리 API는 운영자 인증·Origin·JSON·본문 제한. 네이티브 API는 쿠키를 무시하고 명시적인 코드/토큰만 받는다. 응답은 no-store, 오류는 안전한 고정 문구다.
- 실제 DataGSM 클라이언트 등록은 대기 중이다. 제품 인증 우회 없이 실제 컴포넌트와 분리된 합성 검증 도구를 사용한다.

## Task 1: 인증 라이브러리 연결과 수명주기

Files: server/members/{config,factory,service,errors}.ts, shared/members.ts, tests/member-service.test.ts.

Interfaces: createMemberAuth(settings,db), migrateMembers(auth,db,settings), MemberService.issue/login/refresh/access/logout/reissue/revoke/revokeDevice/snapshot.

- [ ] 실제 Better Auth + SQLite로 코드만 로그인·한 사용자/두 기기·원문 미반환·실패 제한·갱신 재사용/경합·만료·회수/재발급·기기별 로그아웃·관리자 분리의 실패 테스트를 먼저 확인한다.
- [ ] 프레임워크 해시/세션/JWT와 트랜잭션의 버전 재검사로 구현한다. 비동기 검증 중 회수되면 새로 만든 세션을 허용하지 않는다.
- [ ] 키·DB 경로 검증과 명시적 members:migrate를 추가한다. 웹 요청 중 migration하지 않는다.
- [ ] 통과 후 의미 있는 커밋을 만든다.

## Task 2: HTTP 경계

Files: server/http.ts(공유 JSON 제한), server/members/{http,runtime}.ts, app/api/admin/members/[[...path]], app/api/client/[[...path]], tests/member-http.test.ts.

- [ ] 관리자 401/403/503, Origin·메서드·과대 본문, 공개 경로 allowlist·쿠키 무시·안전한 실패·no-store·토큰 종류 혼용 거부를 먼저 실패시킨다.
- [ ] 관리자 발급/재발급/회수/기기 회수, 네이티브 code-login/refresh/logout/me를 얇게 연결한다. 코드·토큰 반환은 필요한 응답에만 한다.
- [ ] 기존 학교 관리 API 테스트와 함께 검증하고 커밋한다.

## Task 3: 관리 UI와 전달

Files: components/members/*, app/admin/invites/page.tsx, admin-nav, CSS·운영 문서.

- [ ] 별칭별 목록·발급·재발급·회수·기기 회수와 일시적 원문 표시/숨김/복사를 구현한다. 기기 상태는 실제 로그인/갱신 기록으로만 표시한다.
- [ ] 합성 자료 UI에서 발급/숨김/재조회/회수·충돌·반응형을 확인한다. 스크린샷은 코드를 숨긴 상태만 저장한다.
- [ ] 전체 check/build, 독립 리뷰의 중요 발견 한 차례 수정, 실제 미로그인 경계와 최신 CI를 확인한다.
- [ ] #4 참조 PR을 생성·연결한다. 이메일·DataGSM 복귀·네이티브 OS 저장·설정 배포는 후속으로 명확히 기록한다.
