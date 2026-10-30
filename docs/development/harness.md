# 개발 하네스

기준일: 2026-10-29. 워셔의 한국어 Conventional Commit, 작업 브랜치, PR 설명, 타입 검사·빌드 게이트를 와글에 맞게 적용했다. 워셔 코드·외부 연동·사용자 전역 설정은 복사하지 않았다.

## 실행되는 장치

| 장치           | 진입점                       | 실제 확인                                        |
| -------------- | ---------------------------- | ------------------------------------------------ |
| 작업 안내      | AGENTS.md와 영역별 AGENTS.md | 제품 규칙·경계·명령·리뷰                         |
| 커밋 전        | .githooks/pre-commit         | staged 비밀 파일·토큰·개인키                     |
| 커밋 제목      | .githooks/commit-msg         | Conventional Commit 형식                         |
| 로컬 품질      | npm run check                | 동작 테스트·저장소·문서·Biome·타입               |
| 빌드           | npm run build                | 문서 자료 준비·관리자 production build           |
| PR 품질        | GitHub Actions의 quality     | Linux에서 동일 명령 실행                         |
| 문서 복사      | npm run docs:prepare         | 공개 가능한 문서만 복사하고 폐기된 출력 정리     |
| 공개 문서 링크 | npm run docs:check           | 원본 대신 실제 복사된 문서의 목차·파일 링크 검사 |

훅은 `npm run setup`으로 명시적으로 설치한다. 훅 우회가 가능하므로 같은 검사를 CI에서도 실행한다. 임의의 학교 비밀번호를 정규식만으로 모두 발견할 수 있는 검사는 아니며, 공개 PR의 내용 검토도 필요하다.

## 작업별 검증 기록

PR의 확인 명령·결과와 관련 이슈가 영속 기록이다. 실행 중 임시 결과는 무시된 .superpowers/ 아래에 둔다. 모든 작업마다 여러 에이전트를 만들지 않고, 필요한 독립 리뷰만 범위를 정해 수행한다.

## 변경 기록

- 2026-10-29: 공개 저장소·루트 AGENTS·커밋 훅·Node 테스트·문서 이식·PR CI 기반 구성.
- 2026-10-29: settings:setup과 settings:migrate 추가. dotenv 파서로 기존 암호화 키를 보존하며 명시적 준비 명령으로만 학교 설정 스키마를 변경한다.

참고한 공개 저장소: [Washer-Client-v2](https://github.com/sunwoo162/Washer-Client-v2). 세부 기술과 상태는 와글의 실제 파일·검사 결과를 기준으로 한다.

## Windows 앱 검사

.NET 10 SDK와 Windows를 사용한다. npm run windows:build는 잠금 파일 기준 복원·Release 빌드, npm run windows:check는 빌드·Windows 테스트·C# 공백 검사까지 수행한다. 실행 중인 검증 앱을 종료하고 실행한다. npm run windows:run은 WPF 앱을 시작한다. .tools/dotnet의 프로젝트 로컬 SDK가 있으면 우선하며 전역 PATH는 수정하지 않는다.

CI의 windows-quality는 windows-latest와 setup-dotnet으로 동일한 locked restore·build·test·format 검사를 실행한다. 기존 quality는 웹·서버·문서 검사다. 각 NuGet packages.lock.json을 커밋하고 bin/obj/.tools는 저장소 검사에서도 차단한다. OTF는 원본·OFL을 보관하는 바이너리 자산으로 취급한다.
NuGet의 packages.lock.json은 도구가 생성한 서식을 유지하며 Biome 대상으로 중복 포맷하지 않는다. 잠금 검증은 dotnet restore --locked-mode가 담당한다.

2026-10-30: Windows 검사에 Native Wi-Fi 버퍼·API 대역, 후보 정책·직렬 coordinator·도감 대기열·SkiaSharp 제한 디코딩·Global mutex 회귀 검사를 추가했다. 실제 무선 API는 검사에서 호출하지 않는다. 별도 합성 WPF 조립은 무시된 .superpowers 아래의 메모리 DB·보호 파일을 사용한다. 일반 앱에 개발용 인증 우회나 무선 대역 플래그를 넣지 않는다. 실행 중인 WPF는 파일을 잠그므로 종료 후 빌드한다.
