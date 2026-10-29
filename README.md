# 와글 · waggle

학교 와이파이를 자동 관리하고, 실제로 연결한 와이파이를 캐릭터로 수집하는 교내 서비스입니다.

**현재 단계** 운영자 인증·네트워크/AP 관리 코드 구현 · DataGSM 클라이언트 등록·교내 실기기 검증 전  
**대상** Android Kotlin · Windows C# · 관리자 웹  
**시각 기준** 사용자 제공 BASE 디자인 시스템

## 개발 시작

Node.js 22, npm 10+, Python 3.11+를 사용합니다.

```sh
npm ci
npm run setup
npm run dev
```

[운영자 로그인](http://localhost:3000/sign-in)에서 시작합니다. 관리자 웹·API는 사전 지정한 운영자 세션을 검사합니다. 현재 클라이언트 미등록으로 설정 대기 상태이며, 실제 학교 설정 등록·기기 연결 검증은 아직 하지 않았습니다. 공개 기획 문서는 /project-docs/handbook/index.html에서 읽을 수 있습니다.

인증 설정은 [DataGSM 등록·실행 안내](docs/development/datagsm-auth.md)를 따릅니다. npm run auth:setup으로 로컬 키를 준비한 뒤 실제 client ID·운영자 ID 설정과 npm run auth:migrate가 필요합니다.

네트워크·AP 저장소는 [학교 설정 안내](docs/development/school-settings.md)에 따라 npm run settings:setup과 npm run settings:migrate로 별도 키·DB를 준비합니다. 비밀번호는 암호화하며 관리 응답에 반환하지 않습니다.

```sh
npm run check       # 동작 테스트·저장소·문서·Biome·타입
npm run build       # 관리자 production build
npm run docs:build  # 기획 문서 허브 재생성
```

| 영역                | 위치                        | 현재                                                   |
| ------------------- | --------------------------- | ------------------------------------------------------ |
| 관리자 웹·공통 서버 | apps/admin                  | 운영자 인증·학교 네트워크/AP 관리, 실제 연동 검증 대기 |
| Android             | apps/android                | Kotlin 구현·실기기 검증 예정                           |
| Windows             | apps/windows                | C# 구현·실기기 검증 예정                               |
| 기획·디자인         | docs                        | 제품·정책·BASE·화면 명세                               |
| 개발 하네스         | AGENTS.md, scripts, .github | 커밋 훅·검사·PR CI                                     |

## 협업 방식

이슈 → 작업 브랜치 → 한국어 Conventional Commit → PR → 검사·리뷰 → Squash merge 흐름을 사용합니다. 자세한 명령과 규칙은 [기여 가이드](CONTRIBUTING.md), [에이전트 안내](AGENTS.md), [하네스 기록](docs/development/harness.md)을 읽어주세요.

## 프로젝트 문서

[브라우저용 문서 허브 열기](docs/handbook/index.html)  
[Markdown 문서 목차 열기](docs/handbook/README.md)

| 기획                                                | 설계                                                        | 진행과 운영                                                   |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| [프로젝트 소개](docs/handbook/pages/01-overview.md) | [아키텍처와 데이터](docs/handbook/pages/04-architecture.md) | [기술 검증과 완료 기준](docs/handbook/pages/08-validation.md) |
| [기능명세서](docs/handbook/pages/02-features.md)    | [API 설계 메모](docs/handbook/pages/05-api.md)              | [개발 일정과 역할](docs/handbook/pages/09-roadmap.md)         |
| [서비스 정책](docs/handbook/pages/03-policies.md)   | [전체 화면 명세](docs/handbook/pages/06-screens.md)         | [운영 준비와 비용](docs/handbook/pages/10-operations.md)      |
| [결정 기록](docs/handbook/pages/11-decisions.md)    | [디자인 시스템](docs/handbook/pages/07-design.md)           | [DataGSM 조사](docs/handbook/pages/12-research.md)            |

## 기록 기준

확정 요구, 기획 제안, 현장 검증 대기, 구현 전 상태를 구분합니다. 같은 계정의 기기 간 도감 공유는 아직 제안이며 실제 연결 성공에 따른 해금은 확정 요구입니다. 가격·출시일·실제 학교 도면은 정해지지 않은 값을 만들어 넣지 않습니다.

원문과 공식 기술 자료는 [참고 자료](docs/handbook/pages/13-resources.md)에서 확인할 수 있습니다.
