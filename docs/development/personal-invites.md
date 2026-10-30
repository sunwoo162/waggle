# 개인 코드와 기기 세션

기준일: 2026-10-29. GSM 전용 와글의 개인 코드 발급·회수와 네이티브 인증 API를 구현했다. Android·Windows 앱은 아직 연결하지 않았으며 실제 사용자 로그인을 검증한 상태는 아니다. 학교 이메일 인증과 DataGSM 네이티브 복귀는 후속 범위다.

## 준비와 관리

```sh
npm run auth:setup
npm run members:migrate
npm run dev
```

관리자 로그인에는 [DataGSM 등록](datagsm-auth.md)이 필요하다. `/admin/invites`에서 이용자 표시 이름을 적고 코드를 발급한다. 표시 이름은 운영자 구분용이며 실명 확인·학교 이메일 확인·자동 계정 병합에 사용하지 않는다. 코드 하나를 본인의 Android와 Windows에서 사용할 수 있다. 별도 발급 항목은 이름이 같아도 다른 계정이다.

전체 코드는 발급·재발급 응답에서 한 번만 표시된다. UI는 메모리에 일시 보관하고 숨김·새로고침·탭 이탈 시 제거한다. 복사한 클립보드까지 원격 삭제하지 않는다. 코드가 유실되면 재발급하며 기존 코드를 다시 조회하지 않는다. 응답을 받지 못한 경우 목록을 먼저 새로고침한 뒤 필요하면 재발급한다.

회수는 코드와 모든 기기 세션을 즉시 거부한다. 재발급은 사용자 ID를 유지하며 기존 코드와 모든 기기 세션을 차단한다. 기기 하나의 회수·로그아웃은 다른 기기를 유지한다. 기기에 이미 설치된 Wi-Fi 프로필이나 저장된 학교 암호를 회수한 것으로 표시하지 않는다. 기기 목록의 유효 상태는 온라인 여부나 현재 위치가 아니다.

## 저장소와 인증 경계

- `WAGGLE_MEMBERS_DATABASE_PATH`: 선택. apps/admin 기준 기본 `.data/members.sqlite`. 관리자 인증·학교 설정 DB와 별도 파일이다.
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`: 기존 인증 설정. 네이티브 인증 secret은 HKDF-SHA256의 별도 문맥으로 파생한다. 키를 바꾸면 기존 저장소는 열리지 않으므로 DB와 원래 키를 함께 복구한다.
- `npm run members:migrate`: Better Auth와 와글 테이블의 명시적 스키마 준비. 사용자·코드를 발급하지 않는다. 요청 중 migration하지 않는다.

단일 영속 Node 서버용 SQLite다. DB·WAL·키를 Git·공개 폴더·빌드에 넣지 않는다. 운영자와 일반 사용자는 별도 Better Auth 인스턴스·DB를 사용한다. 일반 사용자 토큰·쿠키가 운영자 인증을 대신하지 않는다. 네이티브 원래 인증 라우터 `/api/member-internal`은 외부에 연결하지 않고 아래 façade만 노출한다.

코드는 임의 selector 64비트와 비밀 192비트로 구성된다. 비밀은 Better Auth의 password hash/verify로 검증값만 저장한다. 프레임워크의 필수 이메일은 `.invalid` 내부 식별자이며 사용자 이메일로 반환하거나 인증된 이메일로 취급하지 않는다. 코드 소지는 실제 본인·재학생 증명이 아니다. 전달은 운영자가 확인한 교내 이용자에게 직접 한다.

접근 JWT는 Better Auth JWT 플러그인이 서명·검증하며 수명은 15분이다. 프레임워크의 opaque 기기 세션 토큰이 갱신 토큰이고 절대 수명은 30일이다. 갱신하면 기존 접근·갱신 토큰은 무효이며 동일 갱신 토큰의 경합은 한 요청만 성공한다. 매 접근에 서명뿐 아니라 현재 DB 세션·코드 버전·회수·절대 만료를 확인한다. 서명 오류 시 미완료 신규 기기를 제거하고, 갱신 이전 세션을 보존하되 동시 회수를 되돌리지 않는다.

로그인은 전체 120회/분과 등록 selector별 10회/5분이다. 알 수 없는 selector는 공통 버킷을 사용한다. 갱신은 전체 120회/분이고 이용자당 유효 기기 세션은 20개다. 임의 IP 전달 헤더를 신뢰하지 않는다. 이 초기 제한은 학교 전체의 동시 접속량을 실측해 조정할 항목이다. 429의 Retry-After는 보수적으로 300초다.

## API

| 메서드 | 경로                                             | 입력·응답                                             |
| ------ | ------------------------------------------------ | ----------------------------------------------------- |
| GET    | /api/admin/members                               | 원문·해시·토큰 없는 이용자/기기 목록                  |
| POST   | /api/admin/members                               | alias → member, code, snapshot                        |
| POST   | /api/admin/members/:id/reissue                   | revision → member, code, snapshot                     |
| POST   | /api/admin/members/:id/revoke                    | revision → snapshot                                   |
| POST   | /api/admin/members/:id/sessions/:deviceId/revoke | revision → snapshot                                   |
| POST   | /api/client/code-login                           | code, platform(android/windows), deviceName → 토큰 쌍 |
| POST   | /api/client/refresh                              | refreshToken → 교체된 토큰 쌍                         |
| POST   | /api/client/logout                               | refreshToken → 204. 유효한 해당 기기만 로그아웃       |
| GET    | /api/client/me                                   | Authorization: Bearer 접근 JWT → 공개 member, device  |

토큰 쌍 필드: accessToken, refreshToken, tokenType(Bearer), accessExpiresIn(900초), refreshExpiresAt(Unix 밀리초). 이름은 최대 80자, 기기 이름은 최대 64자의 표시 가능한 Unicode이며 앞뒤 공백은 제거한다.

관리 API는 먼저 운영자를 검사하고 쓰기에 정확한 Origin을 요구한다. 네이티브 API는 쿠키를 무시하며 Origin이 있는 요청은 정확한 서비스 Origin만 받는다. JSON 본문은 실제 스트림 기준 16KiB 이하, 알 수 없는 필드는 거부한다. 모든 응답은 private/no-store이며 원문 오류·입력·키를 반영하지 않는다. 성공 응답의 코드·토큰도 요청/응답 로그와 분석 도구에서 제외해야 한다.

## 클라이언트가 지킬 조건과 검증 범위

클라이언트는 HTTPS, OS 보안 저장소, 기기별 직렬 갱신과 토큰 쌍의 원자적 교체가 필요하다. 갱신 응답 유실 후 이전 토큰을 재사용하면 다시 로그인해야 한다. 접근 JWT를 학교 설정 배포에 사용하는 API는 후속 작업이다. 현재 구현만으로 학교 Wi-Fi에 접속하지 않는다.

실제 Better Auth·SQLite 자동 검사에서 두 기기 분리, 회수·재발급, 갱신 재사용·경합, 만료, 서명 실패 복구, 운영자 권한 분리, DB 재개방, HTTP 제한을 확인했다. UI는 별도의 메모리 DB와 합성 자료로 발급·숨김·복사·재발급·기기 회수·충돌·반응형을 검증한다. 제품 인증을 우회하는 API나 가짜 로그인은 추가하지 않았다.

프레임워크 근거: [서버 전용 플러그인](https://better-auth.com/docs/concepts/plugins), [Bearer 플러그인](https://better-auth.com/docs/plugins/bearer), [JWT 플러그인](https://better-auth.com/docs/plugins/jwt). 버전은 잠금 파일의 Better Auth 1.7.14다.
