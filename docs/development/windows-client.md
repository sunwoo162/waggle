# Windows 계정 앱

2026-10-30 기준, .NET 10 LTS·WPF로 개인 코드 로그인·기기 세션 관리 앱을 구현했다. 광주소프트웨어마이스터고등학교 전용이며, 실제 Wi-Fi 변경·트레이·자동 관리·도감은 후속이다.

Windows에서 .NET 10 SDK를 준비한 뒤 루트의 `npm run windows:check`, `npm run windows:run`으로 검사·실행한다. 검사 전 실행 중인 앱을 종료한다. 잠금 파일 기준 복원, Release build, Windows 테스트와 C# 공백 검사는 CI의 windows-quality에서도 실행한다.

운영자에게 받은 코드와 기기 이름으로 로그인한다. 서비스 주소는 HTTPS origin이며 정확한 loopback HTTP만 개발 예외다. 현재 기본값 localhost:3000은 개발용이다. 요청에는 자동 리디렉션·쿠키를 사용하지 않는다. 코드·토큰은 로그나 명령행에 넣지 않는다.

토큰 쌍과 origin만 LocalAppData/Waggle/session.bin에 Windows CurrentUser 보호로 저장한다. 임시 파일도 암호문이고 같은 폴더에서 원자 교체한다. 다른 Windows 계정·다른 PC에 복사해 사용하는 파일이 아니며, 같은 Windows 계정의 악성 소프트웨어까지 차단하는 경계는 아니다.

재실행은 서버에서 세션을 확인하고 필요하면 갱신한다. 갱신·조회·로그아웃을 직렬로 처리하며 새 토큰 저장에 실패하면 새 서버 세션 회수를 시도하고 로컬 인증을 지운다. 통신 장애는 세션을 보존하고 재확인을 안내한다. 회수·만료는 로그인 상태를 지운다. 앱 종료는 로그아웃이나 Wi-Fi 연결 해제를 뜻하지 않는다.

실제 WPF 실행 파일을 실제 인증 서비스·HTTP와 메모리 DB의 합성 계정에 연결해 로그인·재실행 복원·장애/복구·로그아웃·코드 회수를 확인했다. 실제 사람 계정·DataGSM·학교 네트워크 연결 검증으로 표시하지 않는다. 제품 인증 우회·가짜 로그인 모드는 없다.

[인증된 학교 설정 배포](client-school-config.md)와 Windows 검증·계정별 DPAPI 캐시 코어를 추가했다. 앱 화면·OS 프로필 설치에는 아직 연결하지 않았다. 다음 범위는 Native Wi-Fi 조회·실제 연결 성공 관찰이다. 설치 프로그램·서명·업데이트·Android는 아직 구현하지 않았다. 자세한 코드 구성과 복구 조건은 저장소 apps/windows/README.md에 있다.

공식 근거: [WPF](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/), [ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata), [.NET 지원](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core).
