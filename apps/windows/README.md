# 와글 Windows

C#·.NET 10 LTS·WPF 앱이다. 개인 코드 로그인, Windows 계정에 묶인 보호 세션 저장, 재실행 복원·조회·갱신·로그아웃을 구현했다. 실제 Wi-Fi·트레이·백그라운드 관리, 설치 프로그램·자동 업데이트·서명 배포는 후속이다.

## 실행과 검사

Windows 11에서 검증했다. [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/10.0)를 준비한 뒤 루트에서 실행한다. global.json은 정식 10.0 SDK를 요구하며 최신 feature band를 허용한다. 무시된 .tools/dotnet에 준비한 공식 SDK가 있으면 우선하며 전역 PATH는 바꾸지 않는다.

```sh
npm run windows:check
npm run windows:run
```

windows:check는 잠금 파일 복원·Release build·Windows 테스트·C# 공백 검사를 수행한다. 실행 중인 앱은 먼저 종료한다. CI의 windows-quality도 같은 검사를 한다. 웹·공통 서버는 기존 npm run check와 npm run build로 검사한다.

운영자가 안내한 HTTPS origin과 개인 코드·기기 이름을 입력한다. loopback HTTP는 개발용으로만 허용하며 경로·query·fragment·userinfo·일반 HTTP는 거부한다. 현재 기본 주소 localhost:3000은 개발용이며 공개 서비스가 설정된 상태는 아니다. 코드는 요청 시 입력란에서 지우고 저장·로그·명령행 인자로 남기지 않는다.

| 영역                    | 책임                                            |
| ----------------------- | ----------------------------------------------- |
| Waggle.Core             | origin 검증·제한된 인증 HTTP·직렬 세션 수명주기 |
| Waggle.Security.Windows | DPAPI CurrentUser 암호화와 원자적 파일 교체     |
| Waggle.Windows          | WPF 화면·같은 Windows 사용자 단일 인스턴스      |
| Waggle.Tests            | 프로토콜·만료·갱신·저장 실패·실제 OS 보호 검사  |

## 저장·복구

LocalAppData/Waggle/session.bin에 origin과 토큰 쌍만 보호해 저장한다. 코드·별칭·이동 경로를 보관하지 않는다. 임시 파일도 암호문이고 같은 폴더에서 교체한다. DPAPI는 같은 Windows 계정의 다른 소프트웨어까지 격리하는 경계가 아니다. 다른 컴퓨터·Windows 계정으로 파일을 옮겨 로그인하는 용도가 아니다.

401이면 갱신 토큰을 한 번만 사용하며 새 쌍을 저장한 뒤 사용한다. 저장 실패는 새 세션 회수를 시도하고 메모리 인증을 지운다. 갱신 응답 유실 후 이전 토큰을 자동 재사용하지 않는다. 통신 장애는 저장된 세션을 보존하고 재확인을 안내하며, 거부·만료는 제거한다. 로그아웃은 로컬 자료를 지우고 서버 회수를 시도한다. 서버 회수 미확인은 운영자에게 기기 회수를 요청하도록 안내한다.

코드 회수와 앱 종료는 기기에 저장된 Wi-Fi 프로필을 삭제하거나 연결을 끊지 않는다. 로그인 성공을 Wi-Fi 연결이나 도감 해금으로 표시하지 않는다.

## 검증 범위

자동 검사에는 실제 Windows 보호 저장·암호문 변조가 포함된다. UI는 실제 WPF와 서버 인증 서비스·HTTP를 연결한 메모리 DB 합성 자료로 확인한다. 실제 사람·DataGSM·교내 접속 성공이 아니며 제품에 인증 우회·가짜 로그인 플래그는 없다.

다음은 학교 설정 배포, Native Wi-Fi 조회·프로필 연결 요청·실제 결과 확인, 권한 거절·복구와 트레이다. 같은 학교 외부 IP만으로 무중단 로밍을 가정하지 않는다. 기획·BASE는 루트 docs를 따른다.
