# 학교 설정 배포 Implementation Plan

> superpowers:executing-plans로 직접 구현하고 마지막에 읽기 전용 리뷰 한 건을 수행한다. 전체 개발은 remaining-development.md 순서로 계속한다.

**Goal:** 유효한 일반 사용자 세션에 활성 학교 접속정보를 전달하고 Windows에서 검사·동기화·보호 저장한다.

**Architecture:** 관리 DTO와 별도의 최소 client DTO를 사용한다. 서버는 현재 세션·코드 회수 확인 후에만 복호화한다. Windows는 인증 작업과 직렬화하고 origin·member에 묶인 DPAPI 캐시를 저장한다.

**Tech:** 기존 Next.js·Better Auth·SQLite·AES-GCM, .NET 10·HttpClient·CurrentUser DPAPI. 별도 외부 서비스 없음.

## 경계

- GET /api/client/config: schemaVersion=1, version, networks(id,ssid,security,password), accessPoints(id,networkId,bssid). 활성 부모·자식만 포함하고 관리 이름·건물·층·장소·도면은 보내지 않는다.
- OPEN의 password는 null, 보호망은 정상 복호화된 값만 제공한다. 손상·누락·다른 키는 전체 실패로 처리한다. 빈 활성 설정은 정상 빈 배열이며 캐시에 반영한다.
- 현재 일반 사용자 접근 JWT를 매번 확인한다. Cookie·갱신 토큰·운영자 쿠키만으로 전달하지 않는다. Origin이 있으면 정확히 일치해야 한다. private/no-store, 안전한 오류, 응답 본문 로그 금지.
- 내려받기는 기기별 12회/5분으로 제한하며 미인증 요청은 학교 DB를 열지 않는다. 최대 본문은 1MiB. TLS가 기본이며 loopback HTTP만 개발 예외다.
- Windows는 받기 전에 현재 계정을 확인하고 버전·ID·SSID·보안·암호·AP 참조·중복을 검증한다. 받은 버전이 이전보다 작으면 덮어쓰지 않는다. 동일 버전의 다른 내용도 오류다.
- 캐시는 origin·member ID에 묶어 저장한다. 다른 계정·origin의 캐시를 사용하지 않는다. 실패 시 마지막 정상 자료를 보존하며 인증 거부는 새 설정 사용을 중단한다. OS에 저장한 프로필·비밀번호를 원격 회수했다고 표시하지 않는다.
- 이 단계는 연결 정보 전달이다. 아직 OS 프로필을 설치하거나 연결 요청·도감 해금을 수행하지 않는다.

## Task 1 서버

- [x] 실제 SQLite에서 비활성 필터·평문 분리·손상 실패·위치 제외·버전 일치와 인증/회수/Origin/메서드/본문 제한을 먼저 실패시킨다.
- [x] client DTO·학교 저장소 조회와 별도 GET 라우트, 기기별 요청 제한을 구현하고 기존 검사를 통과시킨다.
- [x] 커밋한다.

## Task 2 Windows

- [x] 실제 HTTP의 리디렉션 미추적·길이 헤더 없는 JSON 제한, 설정 검증·일회 갱신·거부와 다른 계정 캐시·저장 실패 검사를 먼저 실패시킨다.
- [x] API·직렬 동기화 코어·보호 캐시를 구현한다. 기존 세션 저장은 유지한다.
- [x] Windows Release build/test·공통 check/build 후 커밋한다.

## Task 3 전달

- [x] 독립 리뷰 한 건, 중요 발견의 회귀 수정, 현재 커밋 CI를 확인한다.
- [x] 운영 가이드·기획 진행도·PR·검사 기록을 반영하고 병합한 다음 캐릭터·도감 단계로 이어간다.

PR #20의 7af74cf에서 quality·windows-quality 통과 후 996f405로 squash 병합했다. 검토와 합성 통합 근거는 docs/development/reviews/2026-10-30-client-school-config.md에 기록했다.
