# DataGSM 운영자 인증 설정

기준일: 2026-10-29. 클라이언트는 아직 등록하지 않았다. 코드·자동 검증과 실제 계정 연동을 구분한다.

## 현재 구현

Better Auth 1.7.14의 Authorization Code + PKCE S256과 서버 state 저장·일회성 검증을 사용한다. DataGSM의 JSON 토큰 교환과 Bearer 사용자 정보 조회를 연결한다. 사전 지정한 DataGSM **계정 ID 한 개**만 운영자다. role ADMIN·이메일·이름으로 관리자 권한을 부여하거나 계정을 자동 연결하지 않는다.

/admin layout·각 페이지·관리 API가 서버에서 세션을 확인한다. SQLite 세션은 8시간 후 만료되고 자동 연장·쿠키 세션 캐시를 사용하지 않는다. HttpOnly·SameSite=Lax와 HTTPS의 Secure 쿠키를 사용한다. 제공자 토큰은 서버 secret으로 암호화 저장하며 브라우저에 제공자 토큰을 반환하는 경로는 열지 않는다.

공개 기획 문서는 /project-docs/handbook/index.html에서 읽을 수 있다. 학교 접속정보나 개인 기록을 넣는 공간이 아니다.

## 로컬 파일 준비

루트에서 실행한다.

```sh
npm ci
npm run auth:setup
```

apps/admin/.env.local이 **없을 때만** 만든다. 와글의 임의 서버 secret을 생성하지만 출력하지 않는다. 기존 파일은 덮어쓰지 않는다. 현재 작업 폴더에는 파일을 준비했으며 client ID와 운영자 ID는 비워뒀다.

| 환경 이름                 | 내용                                                           |
| ------------------------- | -------------------------------------------------------------- |
| BETTER_AUTH_URL           | 개발 기본값 http://localhost:3000. 운영 시 실제 HTTPS origin   |
| BETTER_AUTH_SECRET        | 준비 명령이 생성한 와글 서버 키. 32자 이상의 임의 값           |
| DATAGSM_CLIENT_ID         | DataGSM에서 등록한 와글 OAuth 클라이언트 ID                    |
| WAGGLE_ADMIN_DATAGSM_ID   | 운영자의 /userinfo.id. student.id·학번·이메일·GitHub ID가 아님 |
| WAGGLE_AUTH_DATABASE_PATH | 선택. apps/admin 기준 경로. 기본 .data/auth.sqlite             |

비밀값과 실제 프로필을 채팅·스크린샷·GitHub에 올리지 않는다. .env.local과 .data/는 Git에서 제외한다.

## DataGSM 클라이언트 등록

[공식 클라이언트 관리](https://datagsm.kr/clients)에서 와글용 클라이언트를 만들고 최소 조회 범위 datagsm:self_read를 사용한다. 등록할 로컬 콜백은 다음과 같다.

```text
http://localhost:3000/api/auth/callback/datagsm
```

공식 PKCE 문서는 HTTPS 사용과 localhost 예외를 안내한다. 실제 등록 화면의 허용 조건을 확인한다. 로컬 콜백을 허용하지 않으면 승인된 HTTPS 개발 주소를 사용하고 BETTER_AUTH_URL도 같은 origin으로 바꾼다. 운영 콜백은 실제 HTTPS origin 뒤에 /api/auth/callback/datagsm을 붙인다.

권장 PKCE 교환에는 DataGSM client_secret이 필요하지 않다. 와글 자체 세션 암호화 키 BETTER_AUTH_SECRET과 구분한다.

DataGSM에서 본인 **계정 고유 ID**를 확인해 WAGGLE_ADMIN_DATAGSM_ID에 넣는다. 공식 /userinfo 응답의 최상위 id가 기준이다. ID를 모르면 DataGSM 계정·운영 절차에서 확인해야 한다. 첫 로그인한 사람을 자동 관리자로 등록하지 않는다.

## 스키마 준비와 실행

실제 client ID·운영자 ID를 입력한 뒤 루트에서 실행한다.

```sh
npm run auth:migrate
npm run dev
```

브라우저는 **http://localhost:3000/sign-in**으로 연다. 브라우저 origin과 BETTER_AUTH_URL을 일치시킨다. 설정 변경 후 서버를 다시 시작한다.

마이그레이션은 고정된 Better Auth 버전의 스키마를 사용한다. 데이터가 있는 테이블에 안전하지 않은 필수 컬럼 추가·스키마 충돌이 있으면 자동 진행하지 않는다. 서버 요청 중에는 스키마를 자동 변경하지 않는다.

## 실제 계정 검증

1. DataGSM에서 인증·동의를 완료하고 /admin으로 돌아오는지 확인한다.
2. 운영자가 아닌 계정은 ADMIN 역할이어도 와글에 들어오지 못하는지 확인한다.
3. 취소·제공자 장애·새로고침·로그아웃 후 접근을 확인한다.
4. HTTPS 운영 주소에서는 Secure·HttpOnly·SameSite와 등록 콜백을 확인한다.
5. 로그·브라우저 응답·화면에 제공자 토큰이 노출되지 않는지 확인한다.

아직 실제 DataGSM 클라이언트·사람 계정으로 검증하지 않았다. 자동 테스트는 합성 사용자와 합성 제공자 응답을 사용한다.

## 저장과 운영 경계

초기 SQLite는 **단일 영속 Node 서버**용이다. DB·WAL 파일과 서버 secret을 영속 디스크·별도 비밀 설정으로 관리한다. 일회성 파일 시스템·여러 서버 인스턴스에는 그대로 배포하지 않는다. 해당 운영 환경을 선택할 때 PostgreSQL 등 공유 저장소와 마이그레이션을 별도 작업으로 진행한다.

.env와 실제 DB를 빌드 산출물에 넣지 않는다. DB 백업과 복호화 키 보관·복구 절차를 함께 관리한다. DataGSM 상태는 로그인 시 새로 확인한다. 외부 상태 변경을 기존 세션에 실시간 전파하는 Event 연동은 아직 없으며, 기존 세션은 로컬 allowlist·로그아웃·회수·만료 기준을 따른다.

## 후속 범위

Android·Windows 앱 로그인 복귀와 토큰 교환, 이메일·개인 코드·학생 세션, 학교 설정 저장·배포는 후속 작업이다. 학생 자격 함수가 있어도 학생 가입 API를 제공하는 것은 아니다. 이 PR만으로 이슈 #2 전체를 닫지 않는다.

## 공식 근거

- [DataGSM 인증 시작](https://docs.datagsm.kr/oauth/http/authorize)
- [DataGSM JSON 교환](https://docs.datagsm.kr/oauth/http/token-exchange)
- [DataGSM 사용자 정보](https://docs.datagsm.kr/oauth/http/userinfo)
- [DataGSM PKCE](https://docs.datagsm.kr/oauth/pkce)
- [Better Auth Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)
- [Better Auth SQLite](https://better-auth.com/docs/adapters/sqlite)
- [Better Auth Next.js](https://better-auth.com/docs/integrations/next)
