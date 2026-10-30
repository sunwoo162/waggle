# 앱용 학교 설정 배포

2026-10-30 구현 범위는 인증된 설정 API와 Windows 검증·보호 캐시 코어다. 앱 화면의 자동 동기화·OS 프로필 설치·Wi-Fi 연결·도감 해금은 이 단계의 구현 결과가 아니다.

## 준비와 전송

[학교 설정](school-settings.md)과 [개인 코드·기기 세션](personal-invites.md)을 각각 준비한다. 새 마이그레이션은 없다. `GET /api/client/config`는 현재 일반 사용자 접근 JWT의 Bearer 인증을 요구한다. 쿠키·운영자 세션·갱신 토큰으로 대신할 수 없다. 코드 회수·세션 만료·현재 기기 갱신 포인터를 확인한 뒤에만 학교 저장소를 읽고 접속정보를 복호화한다.

응답은 schemaVersion=1, 학교 설정 version, networks(id, ssid, security, password), accessPoints(id, networkId, bssid)다. 활성 네트워크와 활성 부모를 가진 활성 AP만 포함한다. OPEN의 password는 null이다. 학교 관리 이름·건물·층·장소·좌표·지도는 포함하지 않는다. 관리 API의 비밀번호 없는 DTO는 그대로 유지한다.

접속정보가 들어 있는 응답이므로 운영 HTTPS를 사용한다. 요청·응답 본문, 토큰·암호를 로깅하거나 예시로 복사하지 않는다. 응답은 private/no-store이며 자동 리디렉션을 사용하지 않는다. Origin이 있으면 서비스 origin과 정확히 일치해야 한다. 기기마다 5분에 12회, 최대 응답 1MiB·네트워크 500개·AP 5,000개다. 상한 초과나 보호망 암호의 누락·손상은 부분 자료 대신 안전한 오류로 반환한다.

## Windows 저장과 실패

MemberSession은 기존 인증 작업과 설정 받기·캐시 저장·게시까지 직렬화한다. 계정 확인과 설정 요청 전체에서 접근 토큰 갱신을 한 번만 허용한다. 현재 계정을 확인한 뒤 동기화하며 캐시는 서비스 origin과 검증된 내부 member ID에 묶는다. 스키마·버전·SSID·보안·암호 형식·AP 부모·중복을 검증하고 낮아진 버전이나 같은 버전의 다른 내용은 거부한다. 빈 활성 설정은 정상 자료로 저장한다.

ProtectedSchoolConfigStore는 LocalAppData/Waggle/school.bin을 CurrentUser DPAPI로 보호한다. 세션과 서로 다른 보호 목적 값을 사용하며 임시 파일도 암호문이다. 저장 실패 시 마지막 정상 파일을 보존한다. 다른 계정·origin 또는 로그아웃한 세션에서는 메모리 Current를 노출하지 않는다. 삭제·인증 실패를 구분한다. 실제 앱의 로그아웃 시 캐시 Clear 호출은 자동 관리 화면 통합 단계에서 연결한다.

이 캐시는 같은 Windows 사용자 권한으로 실행하는 악성 소프트웨어까지 격리하는 경계가 아니다. 서버에서 코드를 회수해도 OS에 이미 설치한 학교 프로필을 원격으로 무효화했다고 표시하지 않는다. 오프라인 설정 사용 정책과 OS 프로필 수명주기는 연결 엔진 단계에서 명시한다.

## 검사 근거

- 서버의 실제 SQLite·인증 서비스로 활성 필터·손상 실패·위치 제외·회수·Origin·기기별 제한을 검사한다.
- Windows는 형식·소유자·버전·저장 실패·로그아웃과 실제 DPAPI 저장을 검사한다. 실제 loopback HTTP에서 302 미추적과 Content-Length 없는 큰 JSON의 상한을 확인한다.
- 실제 Node 인증·학교 서비스·HTTP와 .NET 클라이언트·DPAPI를 합성 메모리 DB로 연결해 로그인 → 설정 수신 → 보호 저장·재읽기 → 로그아웃·삭제를 확인했다.

`npm run check`, `npm run build`, Windows에서 `npm run windows:check`를 사용한다. 실제 학생 계정·학교 Wi-Fi·OS 연결 변경 검증을 뜻하지 않는다.
