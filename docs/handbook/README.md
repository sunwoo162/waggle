# 와글 프로젝트 문서

기준일 2026-10-29 · 기획 검토안

브라우저용 [문서 허브](index.html)를 열면 목차와 하위 문서를 탐색할 수 있습니다. 완성된 HTML은 캐릭터 그림과 내용을 포함해 별도 설치 없이 열 수 있습니다.

## 문서 목록

### 기획

- [프로젝트 소개](pages/01-overview.md) · 기획 검토안
- [기능명세서](pages/02-features.md) · 구현 진행
- [서비스 정책](pages/03-policies.md) · 확정과 제안

### 설계

- [아키텍처와 데이터](pages/04-architecture.md) · 설계 초안
- [API 설계 메모](pages/05-api.md) · 계약 미확정
- [전체 화면 명세](pages/06-screens.md) · 34종 기본 화면
- [디자인 시스템](pages/07-design.md) · BASE 기준 채택

### 진행과 운영

- [기술 검증과 완료 기준](pages/08-validation.md) · 실기기 검증 대기
- [개발 일정과 역할](pages/09-roadmap.md) · 달력 일정 미정
- [운영 준비와 비용](pages/10-operations.md) · 운영 전
- [결정 기록과 남은 항목](pages/11-decisions.md) · 확정과 제안

### 참고

- [DataGSM 조사 기록](pages/12-research.md) · 공식 문서 확인
- [원문과 참고 자료](pages/13-resources.md) · 자료 모음

## 문서 갱신

루트에서 npm ci 후 npm run docs:build로 재생성합니다. Python 3.11+와 Node.js 22를 사용하며, Markdown 변환은 잠금 파일에 고정된 marked 패키지를 사용합니다. 기획·디자인 원문과 handbook_content.py가 편집 원본이고 pages 폴더는 내보내기 결과입니다.

원본 구성 참고: [TEAM GSM SERVER](https://app.notion.com/p/TEAM-GSM-SERVER-c0993fbd192d823a9ca201733be710ab?source=copy_link)
