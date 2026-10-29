# 학교 네트워크·AP 관리 Implementation Plan

> **For agentic workers:** superpowers:executing-plans로 직접 구현하고 마지막에 읽기 전용 리뷰 한 건을 수행한다. 승인된 제품 기획과 사용자의 개발 계속 지시를 적용한다.

**Goal:** 운영자가 네트워크 접속정보와 전체 AP 설치 위치를 영속 저장·수정·비활성화한다.

**Architecture:** 별도 SQLite school DB, Node AES-256-GCM, 환경의 독립 32바이트 키를 사용한다. 서버 권한 검사와 Origin 검사를 통과한 관리 API만 쓰기를 수행한다. 브라우저에는 접속 비밀번호·암호문을 반환하지 않는다. Next 페이지는 각각 requireAdmin으로 보호하고 클라이언트 관리 화면은 안전한 DTO만 받는다.

**Tech Stack:** 기존 Next.js·React·TypeScript·better-sqlite3·node:crypto. 새 외부 서비스 없음.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md, GitHub #3, ../../design/design-system.md.

## 제약과 구현 판단

- 네트워크(관리 이름·정확한 SSID·보안·암호·사용 여부)와 AP(BSSID·이름·건물·층·장소·사용 여부)를 분리한다. 같은 SSID의 다른 연결 프로필도 허용한다.
- 1 AP 항목은 1 BSSID다. 같은 물리 장치의 여러 무선 식별자는 별도 항목으로 기록할 수 있다.
- SSID는 공백을 제거하지 않고 UTF-8 1~32바이트를 유지한다. 초기 지원은 OPEN, WPA2-Personal, WPA3-Personal. 개인용 암호는 Windows 공통 지원 범위인 ASCII 8~63자, WPA2는 추가로 64자리 hex를 허용한다. Enterprise·캡티브 로그인은 현장 확인 후 확장한다.
- BSSID는 소문자 콜론 형태로 정규화하며 중복·멀티캐스트·0·브로드캐스트를 거부한다. 위치 필드 누락을 허용하고 위치 미등록으로 표시한다.
- 등록 AP 전체를 제공하며 근처 검색·온라인 상태·학생 위치를 가장하지 않는다.
- 비밀번호는 임의 12바이트 IV·16바이트 tag와 네트워크 ID AAD로 암호화한다. 키 확인용 암호문으로 잘못된 키를 거부한다. 키 자동 재생성·요청 중 스키마 변경을 하지 않는다.
- 설정 버전은 승인된 저장 트랜잭션마다 증가한다. 수정에는 항목 revision이 필요하며 충돌하면 409로 거부한다. 실패한 쓰기는 버전과 데이터 모두 보존한다.
- 관리자 응답은 no-store. 쓰기는 정확한 Origin·JSON과 16KiB 본문 한도를 요구한다. 일반 사용자 설정 배포·네이티브 연결·도감 매핑·실제 학교 데이터는 후속 범위다.
- 실계정 로그인은 미등록 외부 클라이언트로 검증할 수 없다. UI 검증은 실제 컴포넌트의 합성 자료 미리보기로 구분하고 제품 인증 우회 경로를 만들지 않는다.

## Task 1: 저장·암호화·검증

Files: shared/school.ts, server/school/{errors,crypto,store}.ts, tests/school-store.test.ts.

Interfaces: CredentialCipher.seal/open(value,purpose), migrateSchoolDatabase(db,key), SchoolStore.snapshot/saveNetwork/saveAccessPoint. Snapshot은 비밀번호·암호문을 포함하지 않는다.

- [x] 실제 메모리/재개방 SQLite로 암호문·키/태그/AAD 오류·원문 미반환·revision 충돌·버전 원자성·SSID 바이트·BSSID 중복/위치 없음의 실패 테스트를 먼저 확인한다.
- [x] 구현하고 해당 테스트를 통과시킨다. 네트워크 비활성화 시 AP 기록은 유지하며 effectiveEnabled를 구분한다.
- [x] 설정·키 준비와 명시적 migration, .env 예시·문서를 추가한다. 키 생성은 기존 값을 보존하고 출력하지 않는다.
- [x] 의미 있는 저장 기능 커밋을 만든다.

## Task 2: 관리 API와 서버 경계

Files: server/school/{http,runtime}.ts, app/api/admin/school/[[...path]]/route.ts, tests/school-http.test.ts.

Interfaces: createSchoolHandler({getAccess,getStore,origin}) → Request handler. GET /api/admin/school, POST networks/access-points, PATCH networks/:id/access-points/:id.

- [x] 401/403/503·외부/누락 Origin·과대 본문·잘못된 JSON/메서드·안전한 오류·원문 미반환 테스트를 먼저 실패시킨다.
- [x] 실제 저장소와 핸들러로 쓰기/재조회/충돌을 검증한다. 인증 실패 시 저장소를 열지 않는다.
- [x] 지연 runtime과 얇은 Next 경로를 연결하고 커밋한다.

## Task 3: 관리 화면과 검증

Files: components/school/*, app/admin/{networks,access-points}/page.tsx, management.css, admin-nav/shell, 개발 문서.

- [x] 네트워크 추가·수정·비활성화, 빈 상태·실패·저장 중·충돌과 비밀번호 유지/교체 입력을 제공한다.
- [x] 전체 AP 목록·이름/BSSID 검색·건물/층/위치 미등록 필터·등록/수정을 제공한다. 부모 네트워크 비활성화를 별도로 표시한다.
- [x] 실제 컴포넌트의 합성 UI 자료를 별도 검증하고 미로그인 제품 경로 차단을 확인한다. 실계정·실제 학교 연결로 표시하지 않는다.
- [x] npm run check/build, 문서 재생성, 독립 리뷰와 필요한 한 차례 수정, 최신 CI를 확인한다.
- [x] #3 PR을 생성·연결하고 구현/검증/현장 검증 경계를 기록한다.
