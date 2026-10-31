# AP 캐릭터와 계정 도감 Implementation Plan

> superpowers:executing-plans로 직접 구현하고 전체 브랜치에 읽기 전용 리뷰 한 건을 수행한다. 사용자의 남은 전체 개발 진행 지시와 확정한 AP별 캐릭터·계정 공유 기준을 따른다.

**Goal:** 관리자 웹에서 등록 AP마다 캐릭터를 편집하고 같은 내부 계정의 수집 집합을 앱 API로 공유한다.

**Architecture:** 학교 DB에는 AP에 종속된 콘텐츠와 재인코딩한 래스터 자산, 별도 일반 사용자 DB에는 member/AP 집합만 저장한다. 승인된 앱은 위치 없는 도감과 본인의 수집 상태를 받고 OS가 관찰한 연결을 보고한다. 실제 OS 관찰·보호 대기열·사용자 UI는 다음 네이티브 단계에서 연결한다.

**Tech Stack:** 기존 Next.js·SQLite·Better Auth와 직접 고정한 sharp 의존성. 별도 스토리지 서비스 없이 학교 DB의 제한된 이미지 BLOB을 사용한다.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md, ../../product/project-planning.md, ../../design/design-system.md.

## 제약과 구현 판단

- GSM 전용. 등록 AP 하나(BSSID 하나)에 캐릭터 하나. 같은 내부 계정의 기기만 공유하며 계정을 자동 병합하지 않는다.
- 캐릭터 미편집 AP도 이름 없는 친구·이미지 없음으로 표시한다. 미발견 앱 표현은 회색이다. 지도·설치 위치는 관리자에게만 제공한다.
- 네트워크/AP 비활성화는 새 수집을 막고 앱 목록에서 숨긴다. 수집 집합 자체를 지우지 않으므로 재활성화하면 복원된다.
- 서버는 인증된 앱의 OS 연결 보고를 받으며 무선 접속을 독립적으로 증명하지 않는다. 보고의 SSID·BSSID·AP가 현재 활성 설정과 일치해야 한다. 방문 시각·기기별 AP 이력은 저장하지 않는다.
- 이미지 업로드는 관리자·동일 Origin만 허용한다. PNG/JPEG/WebP만 최대 2MiB·4M 픽셀·한 프레임, 1024px 이내 WebP로 재인코딩해 메타데이터를 제거한다. 저장 출력은 1MiB 이하, 전체 자산은 128MiB 이하로 제한하고 참조 없는 자산을 정리한다. 이미지 내용은 공개 가능한 캐릭터로 한정한다.
- 공개 자산 URL은 콘텐츠 해시만 사용하며 고정 MIME·nosniff·불변 캐시를 제공한다. 외부 URL·SVG·임의 파일 경로는 받지 않는다.
- 학교 스키마와 일반 사용자 스키마는 명시적 migrate 명령으로만 v1→v2로 올린다. 기존 키·접속정보·계정·기기 세션은 보존한다.

## 파일 경계

- server/school/store.ts: 학교 스키마 준비, 캐릭터 저장소 조립. characters.ts: 캐릭터·자산 조회/원자 저장·연결 보고 검증. image.ts: 바이트 검사·재인코딩.
- shared/encyclopedia.ts: 위치 없는 앱 DTO와 관리자 캐릭터 DTO. server/school/character-http.ts: 관리·앱 목록·공개 이미지의 HTTP 경계.
- server/members/factory.ts와 service.ts: 명시적 수집 테이블 준비·인증된 계정별 집합, collection-http.ts: 허용된 GET/POST만 노출.
- app/admin/characters와 components/characters: 목록·검색·편집·업로드·미리보기. app/api의 정확한 경로에 기존 인증 경계를 연결한다.

## Review Focus

1. 기존 스키마·잘못된 키·재실행 마이그레이션에서 기존 암호문·세션 보존.
2. 이미지 형식 위장·큰 치수·다중 프레임·저장 충돌이 자료를 바꾸지 않음.
3. 인증 거부·회수는 학교 DB나 수집 상태에 접근하기 전에 차단.
4. 다른 계정·동일 기기 중복·비활성 AP·SSID/BSSID 불일치 보고의 격리와 전체 실패.
5. 오래된 관리자 수정이 그림·텍스트를 부분 변경하지 않고 입력을 복구할 수 있음.

## Task 1 학교 콘텐츠

- [x] tests/characters.test.ts에서 스키마 이전·AP당 하나·revision 충돌·위치 제외·비활성화·이미지 형식/픽셀/용량·자산 정리를 먼저 실패시킨다.
- [x] CharacterStore(database)의 snapshot(), catalog(), save(apId,input), asset(hash), validateReports(input)를 구현한다. save는 이미지 검사를 await한 뒤 트랜잭션에서 revision을 다시 검사한다.
- [x] node --import tsx --test tests/characters.test.ts tests/school-store.test.ts tests/client-config.test.ts 통과 후 커밋.

## Task 2 인증된 도감 동기화

- [x] tests/collection.test.ts와 tests/character-http.test.ts에서 실제 인증/DB의 두 기기·다른 계정·중복·회수·본문/Origin 제한·현재 AP 검증을 먼저 실패시킨다.
- [x] GET /api/client/encyclopedia, GET/POST /api/client/collection, GET/PATCH /api/admin/characters, GET /api/art/:hash를 연결한다. POST 보고는 최대 100개, 기기별 도감 요청 60회/5분. 계정·시각을 요청에서 받지 않는다.
- [x] 관련 검사·TypeScript 통과 후 커밋.

## Task 3 관리자 화면과 전달

- [x] 목록 검색·AP 선택·텍스트/그림 저장·빈 상태·오류·revision 충돌·회색/컬러 미리보기를 BASE로 구현한다. 관리자 메뉴의 준비 중 항목을 실제 경로로 교체한다.
- [x] 실제 화면은 합성 DB와 실제 관리 HTTP를 이용해 확인하고 운영 데이터나 인증 우회 경로를 만들지 않는다.
- [x] 운영 안내·기획 상태·이전 단계 완료 기록을 반영하고 check/build를 통과시킨다.
- [x] 독립 리뷰 한 건과 필요한 RED→GREEN 수정, PR의 정확한 커밋 CI 확인 후 병합한다. Windows 연결 엔진 단계로 계속한다.

PR #21의 ee14e59에서 quality·windows-quality 통과 후 f246c93으로 squash 병합했다. 읽기 전용 리뷰 1건의 Minor UI 발견을 실제 브라우저에서 재현·수정했다.
