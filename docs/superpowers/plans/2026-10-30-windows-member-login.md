# Windows 개인 코드 로그인 Implementation Plan

> **For agentic workers:** superpowers:executing-plans로 직접 구현한다. 최종 별도 리뷰 한 건만 사용한다. 사용자는 계속 개발을 지시했으며 C#·BASE·개인 코드·기기별 세션은 기존 승인 요구다.

**Goal:** 실제 실행 가능한 Windows 앱에서 코드 로그인·보호 저장·복원·본인 조회·로그아웃을 제공한다. #16을 해결하며 #4와 #5 전체를 닫지 않는다.

**Architecture:** WPF UI, 테스트 가능한 순수 C# 인증 코어, Windows DPAPI CurrentUser 저장을 분리한다. 현재 API 계약을 재사용한다. 학교 설정 배포·Wi-Fi 변경·트레이·도감은 후속이다.

**Tech Stack:** .NET 10 LTS·WPF, HttpClient·System.Text.Json, Microsoft ProtectedData, MSTest. SDK는 프로젝트 내부 도구 경로 또는 설치된 공식 SDK를 사용하며 전역 PATH·보안 정책은 바꾸지 않는다.

## 구현 결정

- 지원 만료가 가까운 .NET 8 대신 현재 LTS .NET 10을 사용한다. Windows 11에서 검증하며 다른 Windows 지원 범위를 확인 전 약속하지 않는다.
- HTTPS origin만 허용한다. HTTP 개발 예외는 정확한 localhost/127.0.0.1/[::1]뿐이고 userinfo·경로·query·fragment는 거부한다. 로그인·토큰 요청에 자동 리디렉션·쿠키를 사용하지 않는다.
- 코드는 PasswordBox에 입력하고 요청 뒤 즉시 지우며 디스크·로그·명령행·클립보드에 넣지 않는다. 기기 표시 이름은 사용자가 정하고 하드웨어 ID를 수집하지 않는다.
- 보관 자료는 origin과 토큰 쌍뿐이다. LocalAppData/Waggle/session.bin에 DPAPI CurrentUser 보호 후 같은 폴더 임시 파일에서 원자 교체한다. 원문 JSON 임시 파일을 만들지 않는다. 암호문이 깨졌으면 로그인 안내를 주고 원문 오류를 표시하지 않는다.
- 서비스 코어의 SemaphoreSlim으로 복원·로그인·갱신·조회·로그아웃을 직렬 처리한다. 새 갱신 토큰 저장에 실패하면 메모리 인증도 지우고 새 토큰 로그아웃을 시도한다. 이전 토큰으로 자동 재시도하지 않는다.
- 재실행 시 origin과 토큰을 복원하고 /me 확인, 401이면 한 번 갱신 후 재확인한다. 거부·절대 만료면 로컬 인증을 제거한다. 통신 장애는 인증 거부와 구분하고 저장된 세션을 함부로 삭제하지 않는다.
- UI는 서버 미설정·입력 오류·통신 장애·세션 만료·저장 실패를 구분한다. 로그인 완료를 Wi-Fi 연결 완료로 표시하지 않는다. 종료 시 Wi-Fi를 변경하지 않는다.
- 앱은 명시적인 로그인 화면과 계정 상태만 제공한다. 도감·자동 관리의 작동하지 않는 버튼을 만들지 않는다. 설정 화면에서 서버를 변경하려면 기존 계정을 로그아웃해야 한다.

## Task 1: 프로토콜·세션 코어

Files: apps/windows/Waggle.Core/*, Waggle.Tests/*, Waggle.slnx, global.json, Directory.Build.props.

Interfaces: ServiceOrigin.Parse, MemberApi.Login/Refresh/Me/Logout, ISessionStore.Load/Save/Clear, MemberSession.Login/Restore/Check/Logout.

- [ ] origin·redirect·요청 DTO·응답 제한과 오류 분류, 로그인·복원·401 갱신·회수·통신 장애·직렬 경합·저장 실패를 먼저 실패시키고 최소 구현한다.
- [ ] HttpClient 응답을 크기 제한·엄격 검증하고 코드/토큰을 오류에 반영하지 않는다. 외부 오류 내용을 UI에 전달하지 않는다.
- [ ] 독립 코어 테스트를 통과시키고 커밋한다.

## Task 2: Windows 저장과 UI

Files: apps/windows/Waggle.Windows/*, Windows 저장소 검사와 실행 안내.

- [ ] DPAPI 왕복·원문 부재·잘못된 암호문·교체·삭제를 먼저 실패시킨 뒤 구현한다. 실제 OS 보호 기능을 검사한다.
- [ ] BASE 흰색·청록·14~16px 본문과 28px 제목을 적용한 WPF 코드 로그인/계정 화면을 만든다.
- [ ] 실제 실행 UI와 합성 API에서 로그인·재실행 복원·조회·회수·통신 장애·로그아웃을 검증한다. 코드를 표시한 화면은 캡처하지 않는다.
- [ ] Windows 빌드·테스트를 CI와 문서에 연결하고 커밋한다.

## Task 3: 검토와 PR

- [ ] 전체 저장소 check/build와 Windows Release build/test, 한 번의 독립 읽기 전용 리뷰와 필요한 수정, 비밀 파일/빌드 출력 확인.
- [ ] #16 PR 생성·연결·현재 커밋 CI 통과. 실제 학교·Wi-Fi·DataGSM 로그인을 검증한 것으로 표시하지 않는다.

공식 근거: [WPF](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/), [.NET 지원](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core), [ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata), [SDK 설치 도구](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-install-script).
