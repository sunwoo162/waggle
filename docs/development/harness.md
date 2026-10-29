# 개발 하네스

기준일: 2026-10-29. 워셔의 한국어 Conventional Commit, 작업 브랜치, PR 설명, 타입 검사·빌드 게이트를 와글에 맞게 적용했다. 워셔 코드·외부 연동·사용자 전역 설정은 복사하지 않았다.

## 실행되는 장치

| 장치      | 진입점                       | 실제 확인                                       |
| --------- | ---------------------------- | ----------------------------------------------- |
| 작업 안내 | AGENTS.md와 영역별 AGENTS.md | 제품 규칙·경계·명령·리뷰                        |
| 커밋 전   | .githooks/pre-commit         | staged 비밀 파일·토큰·개인키                    |
| 커밋 제목 | .githooks/commit-msg         | Conventional Commit 형식                        |
| 로컬 품질 | npm run check                | 동작 테스트·저장소·문서·Biome·타입              |
| 빌드      | npm run build                | 문서 자료 준비·관리자 production build          |
| PR 품질   | GitHub Actions의 quality     | Linux에서 동일 명령 실행                        |
| 문서 복사 | npm run docs:prepare         | 공개 가능한 문서 파일만 관리자 정적 자료로 복사 |

훅은 `npm run setup`으로 명시적으로 설치한다. 훅 우회가 가능하므로 같은 검사를 CI에서도 실행한다. 임의의 학교 비밀번호를 정규식만으로 모두 발견할 수 있는 검사는 아니며, 공개 PR의 내용 검토도 필요하다.

## 작업별 검증 기록

PR의 확인 명령·결과와 관련 이슈가 영속 기록이다. 실행 중 임시 결과는 무시된 .superpowers/ 아래에 둔다. 모든 작업마다 여러 에이전트를 만들지 않고, 필요한 독립 리뷰만 범위를 정해 수행한다.

## 변경 기록

- 2026-10-29: 공개 저장소·루트 AGENTS·커밋 훅·Node 테스트·문서 이식·PR CI 기반 구성.

참고한 공개 저장소: [Washer-Client-v2](https://github.com/sunwoo162/Washer-Client-v2). 세부 기술과 상태는 와글의 실제 파일·검사 결과를 기준으로 한다.
