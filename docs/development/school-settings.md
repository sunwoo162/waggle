# 학교 네트워크·AP 저장소

기준일: 2026-10-29. 관리자 웹의 등록·수정·사용 중지와 설치 위치 조회를 구현했다. 실제 학교 데이터를 등록하거나 네이티브 앱에 배포한 것은 아니다. 관리자 로그인은 [DataGSM 설정](datagsm-auth.md)을 먼저 완료해야 한다.

## 준비

루트에서 실행한다.

```sh
npm run auth:setup
npm run settings:setup
npm run settings:migrate
npm run dev
```

settings:setup은 apps/admin/.env.local의 기존 인증 값과 암호화 키를 보존한다. 키가 비어 있거나 없을 때만 임의 32바이트 키를 준비하며 값을 출력하지 않는다. 기존 DB의 키를 잃었다면 새 키를 만드는 대신 원래 키를 복원한다. 환경 변경 후 서버를 다시 시작한다. 마이그레이션은 명시적으로 실행하며 웹 요청 중 스키마를 생성하지 않는다.

| 환경 변수                      | 내용                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| WAGGLE_SETTINGS_ENCRYPTION_KEY | 32바이트를 64자리 hex로 표현한 독립 키. DB나 Git에 보관하지 않는다. |
| WAGGLE_SETTINGS_DATABASE_PATH  | 선택. apps/admin 기준 경로, 기본 .data/school.sqlite.               |

인증 DB와 같은 파일, public/·.next/ 아래 경로는 거부한다. 단일 영속 Node 서버용 SQLite다. DB·WAL과 키를 별도로 보관·복원하고 여러 인스턴스나 일회성 파일 시스템으로 그대로 배포하지 않는다. 초기 키 교체 자동화는 없으며 키를 바꾸려면 기존 자료의 안전한 재암호화·복구 계획이 필요하다.

## 관리 화면

- /admin/networks: 관리 이름, 정확한 SSID, 보안 방식, 비밀번호와 사용 여부.
- /admin/access-points: 전체 AP의 BSSID, 연결 네트워크, 이름, 건물·층·설치 장소와 사용 여부.

같은 SSID를 사용하는 여러 연결 프로필을 허용한다. 관리 이름으로 구분하고 AP를 해당 프로필에 연결한다. 1 AP 항목은 1 BSSID이며 물리 장치의 여러 무선 식별자를 각각 등록할 수 있다. 주변에 보이지 않는 항목도 조회한다. 네트워크 사용 중지 시 AP 기록을 삭제하지 않고 부모의 사용 중지를 따로 표시한다.

건물·층·장소가 모두 있으면 위치 등록 완료다. 일부 또는 전체가 비어 있어도 저장하며 위치 미등록 필터에 포함한다. 도면·지도 좌표와 실제 현장 확인은 후속 범위다. 설치 위치 목록은 AP 온라인 여부·혼잡도·학생 현재 위치가 아니다.

## 입력 범위

SSID는 UTF-8 1~32바이트의 표시 가능한 문자열이며 앞뒤 공백을 유지한다. 현재 OPEN, WPA2-Personal, WPA3-Personal을 저장한다. Enterprise와 캡티브 로그인은 현장 확인 후 확장할 항목이다.

개인용 암호는 Windows와 공통으로 사용할 ASCII 8~63자, WPA2는 추가로 64자리 hex 키를 허용한다. WPA3의 hex 키는 이 초기 범위에 포함하지 않는다. 이 검증은 실제 학교 AP·드라이버 호환성 검사와 별개다. [Windows sharedKey 명세](https://learn.microsoft.com/en-us/windows/win32/nativewifi/wlan-profileschema-sharedkey-security-element)를 기준으로 범위를 제한했다.

BSSID는 소문자 콜론 형식으로 저장한다. 중복, 잘못된 길이, 멀티캐스트·브로드캐스트·전체 0 주소를 거부한다. 수정에는 현재 revision이 필요하다. 오래된 화면에서 저장하면 409를 반환하므로 최신 정보를 불러온 뒤 다시 수정한다.

## 암호화와 API

Node의 AES-256-GCM, 매번 생성한 12바이트 IV, 16바이트 인증 tag와 네트워크 ID를 포함한 AAD를 사용한다. DB에는 암호문과 키 확인용 암호문만 저장한다. 키는 환경에 따로 둔다. [Node 22 Crypto 명세](https://nodejs.org/download/release/latest-jod/docs/api/crypto.html)를 따른다.

관리 DTO는 비밀번호·암호문을 반환하지 않고 hasPassword만 제공한다. 수정 양식의 빈 비밀번호는 기존 값 유지, 새 값 입력은 교체, OPEN 전환은 제거다. 새 연결이나 보안 방식 변경에는 비밀번호를 요구한다. 저장된 비밀번호를 보여주는 기능은 없다.

| 메서드 | 경로                                | 동작                                    |
| ------ | ----------------------------------- | --------------------------------------- |
| GET    | /api/admin/school                   | 버전·네트워크·전체 AP의 안전한 관리 DTO |
| POST   | /api/admin/school/networks          | 네트워크 등록                           |
| PATCH  | /api/admin/school/networks/:id      | 수정·사용 중지/재개                     |
| POST   | /api/admin/school/access-points     | AP 등록                                 |
| PATCH  | /api/admin/school/access-points/:id | 위치·연결·사용 여부 수정                |

모든 경로는 서버에서 운영자 세션을 검사한다. 쓰기는 정확한 Origin, JSON, 실제 본문 16KiB 이하를 요구한다. 인증 실패 시 저장소를 열지 않는다. 응답은 private/no-store이며 오류 원문이나 입력한 비밀번호를 반영하지 않는다. 승인된 쓰기마다 전체 설정 버전과 항목 revision이 한 트랜잭션에서 증가하고 실패 시 모두 보존한다.

## 검증과 남은 범위

합성 제공자의 인증 검사, 실제 SQLite 저장·재개방, 암호문 변조·키·AAD, 수정 충돌·버전, 입력 검증과 API 경계를 자동 확인한다. UI는 실제 관리 컴포넌트와 메모리 DB를 사용하는 분리된 합성 자료로 조작했다. 이 화면에는 검증용 표시를 붙이고 제품 DB·환경·세션을 사용하지 않았다. 제품에 인증 우회 경로를 추가하지 않았다.

실제 DataGSM 계정 → 관리 페이지 → 학교 정보 등록의 전체 흐름, 교내 SSID/BSSID·설치 장소, Android·Windows 설정 배포와 실제 연결은 아직 확인 전이다. 일반 사용자에게 접속정보를 전달하는 동기화 API는 이 PR에 포함하지 않는다.

2026-10-30 후속 구현: [앱용 설정 배포](client-school-config.md)와 [AP 캐릭터 관리](encyclopedia.md)를 추가했다. 현재 스키마는 v2이며 기존 DB는 settings:migrate로 명시적으로 이전한다. 실제 학교 연결 검증은 계속 대기 중이다.
