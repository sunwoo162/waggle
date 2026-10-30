from pathlib import Path
import re

def build_pages(docs_root):
    def read(name):
        return (docs_root / name).read_text(encoding="utf-8")
    product = read("product/project-planning.md")
    design = read("design/design-system.md")
    screens = read("design/2026-10-29-figma-screen-brief.md")
    research = read("research/2026-10-29-datagsm-data.md")

    def take(text, numbers):
        matches = list(re.finditer(r"(?m)^## (\d+)\. ([^\r\n]+)\r?$", text))
        result = []
        for number in numbers:
            index = next(i for i, m in enumerate(matches) if int(m.group(1)) == number)
            match = matches[index]
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            result.append("## " + match.group(2) + "\n\n" + text[match.end():end].strip())
        return "\n\n".join(result)

    def note(kind, label, body):
        return '<aside class="doc-note ' + kind + '"><span>' + label + '</span><p>' + body + '</p></aside>'

    headings = list(re.finditer(r"(?m)^### ([MWA]\d{2})\. ([^\r\n]+)\r?$", screens))
    screen_records = []
    for i, match in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(screens)
        body = screens[match.end():end]
        next_h2 = re.search(r"(?m)^## ", body)
        if next_h2:
            body = body[:next_h2.start()]
        screen_records.append(dict(id=match.group(1), title=match.group(2), body=body.strip()))
    assert len(screen_records) == 34

    def page(id, title, eyebrow, group, badge, summary, markdown, source=None):
        return dict(id=id, title=title, eyebrow=eyebrow, group=group, badge=badge,
                    summary=summary, markdown=markdown, source=source)

    pages = [
        page("overview", "프로젝트 소개", "PRODUCT", "기획", "기획 검토안",
             "무엇을 만들고, 누가 사용하며, 첫 출시에 어디까지 제공하는지 정리합니다.",
             note("fixed", "GSM 전용", "광주소프트웨어마이스터고등학교 한 곳에서 사용하는 와이파이 자동 관리·캐릭터 수집 서비스입니다.")
             + "\n\n" + take(product, [1, 2, 3, 5]), "product/project-planning.md"),

        page("features", "기능명세서", "REQUIREMENTS", "기획", "구현 진행",
             "서비스의 기능과 완료 조건을 한 표에서 비교합니다.",
             note("pending", "구현 진행", "운영자 웹 인증과 네트워크·AP 관리 코드는 구현했습니다. 실제 계정 연동·교내 설정·앱 기능은 검증 전입니다.") + """

## 사용자 기능

| ID | 기능 | 완료 조건 |
| --- | --- | --- |
| F01 | DataGSM 로그인 | 외부 브라우저 인증 후 앱 세션을 발급하고 취소·실패를 안내한다 |
| F02 | 학교 이메일 인증 | s로 시작하는 @gsm.hs.kr 주소의 소유를 확인한 뒤 로그인한다 |
| F03 | 개인 코드 로그인 | 이메일 없이 개인 코드만으로 로그인하고 회수된 코드를 거부한다 |
| F04 | 초기 설정·동기화 | 권한·네트워크 등록 동의와 학교 설정 수신 상태를 표시한다 |
| F05 | 자동 연결 관리 | 현재 연결과 후보를 비교하고 플랫폼이 허용하는 연결을 요청한다 |
| F06 | 백그라운드 관리 | 화면 밖에서 허용되는 실행을 이어가며 중단·권한 필요 상태를 표시한다 |
| F07 | 실패·복구 | 실제 결과를 확인하고 가능한 이전 연결로 복구를 시도한다 |
| F08 | 도감 해금 | 실제 연결에 성공한 등록 와이파이에 연결된 캐릭터만 해금한다 |
| F09 | 캐릭터 도감 | 이미지·별명·수집 상태 중심. 미발견은 회색이며 사용자 지도는 제공하지 않는다 |
| F10 | 기록·설정 | 로컬 연결 기록, 설정 동기화와 권한 복구 방법을 제공한다 |

## 관리자 기능

| ID | 기능 | 완료 조건 |
| --- | --- | --- |
| F11 | 운영자 인증 | 사전에 지정된 관리자 한 명만 관리 API와 웹에 접근한다 |
| F12 | 네트워크 관리 | SSID·보안 방식·비밀번호·사용 여부를 등록·수정한다 |
| F13 | 전체 AP 위치 | 관리자 웹에서만 지도·도면·건물·층·장소로 전체 AP를 조회·관리한다 |
| F14 | 도감 콘텐츠 | 캐릭터 별명·이미지·설명과 와이파이 매핑을 관리한다 |
| F15 | 개인 코드 관리 | 개인별 발급·회수·재발급, 발급 시 한 번의 원문 노출을 제공한다 |
| F16 | 사용자·세션 | 계정·기기 세션·서비스 접근 상태를 확인하고 접근을 회수한다 |

## 공통 동작

- 학생에게 각 와이파이 비밀번호를 직접 입력하도록 요구하지 않는다.
- 연결 요청만으로 연결 성공이나 도감 수집을 기록하지 않는다.
- 관리자가 바꾼 설정은 앱의 다음 동기화 때 반영한다.
- 서비스 접근 회수와 학교 네트워크 자체의 접속 차단을 구분한다.
- 로딩·권한 거절·설정 없음·오프라인·저장 실패 상태를 포함한다.

## 후속 범위

기기 간 도감 공유·AP와 캐릭터의 묶음·부팅 자동 시작은 결정 기록의 제안 항목을 따른다. 급식·시간표·공개 순위·상점은 첫 출시 이후의 검토 후보이다. 서비스 대상 학교는 GSM 한 곳으로 고정한다.
"""),

        page("policies", "서비스 정책", "POLICY", "기획", "확정과 제안",
             "인증·권한·수집·오프라인 동작의 기준입니다.",
             note("fixed", "확정", "도감은 실제 연결 성공이 기준입니다. 신호 발견이나 연결 시도만으로 해금하지 않습니다.")
             + "\n\n" + take(product, [6, 8]) + """

## 운영자와 일반 사용자

학교 이메일·개인 코드·DataGSM의 세 로그인 경로를 제공한다. 관리자는 운영자 한 명이다. 학교 이메일이나 DataGSM의 ADMIN 값만으로 우리 서비스의 관리자 권한을 부여하지 않는다.

개인 코드는 특정 사용자에게 발급하는 로그인 자격증명이다. 같은 사람의 휴대폰·노트북에서 사용할 수 있으며, 전체 값은 발급 시 한 번만 보여준다.

## 최초 설정과 오프라인

첫 설치·로그인·인증·설정 다운로드에는 인터넷이 필요하다. 저장된 설정이 있으면 서버가 잠시 연결되지 않아도 OS와 로컬 설정으로 연결을 지원한다. 새 로그인·코드 검증·변경된 접속정보 수신은 서버 연결 후 처리한다.

## 백그라운드 실행

Windows 창 닫기는 트레이 실행으로 이어지는 구성을 제안한다. Android는 목적에 맞는 실행 방식과 필요한 알림을 사용하고 검색·절전·제조사 정책을 검증한다. 강제 종료·기기 절전 중에도 앱이 항상 실행 중이라고 표시하지 않는다.

## 설치 위치와 개인정보

관리자 지도는 AP의 건물·층·설치 장소를 보여준다. 학생의 GPS·현재 위치·이동 경로를 중앙에 모으는 기능은 첫 버전 범위에 포함하지 않는다.

DataGSM의 고유 사용자 ID와 활성 재학생 상태를 확인한다. 이름·학년·반·번호는 목적이 있을 때 활용한다. 이메일·개인 코드·DataGSM 계정은 이름이나 이메일 일치만으로 자동 병합하지 않는 방식을 제안한다.
"""),

        page("architecture", "아키텍처와 데이터", "SYSTEM DESIGN", "설계", "설계 초안",
             "플랫폼의 책임과 서버·기기의 데이터 관계를 정리합니다.", """
## 구성별 책임

| 구성 | 책임 | 경계 |
| --- | --- | --- |
| 관리자 웹 | 네트워크·AP 위치·캐릭터·코드·사용자 관리 | 운영자 한 명의 인증 필요 |
| 공통 서버 | 인증·권한·설정 배포, 제안된 도감 동기화 | 학교 AP를 직접 제어하는 컨트롤러가 아님 |
| Windows 앱 | 조회·연결 요청·결과 확인·트레이·도감 | 권한·어댑터·드라이버별 동작 확인 |
| Android 앱 | 네트워크 제안·상태 확인·허용된 실행·도감 | 최종 선택은 운영체제가 수행 |
| DataGSM | 기존 학교 계정 인증과 허용된 본인 정보 | 우리 서비스의 관리자 권한과 별개 |

## 정보 흐름

관리자가 등록한 학교 설정은 서버에 저장된다. 로그인한 앱이 설정을 동기화하고, 기기에서 주변 연결을 판단한다. 운영체제의 실제 연결 성공을 관찰하면 수집을 기록한다. DataGSM 로그인 성공과 학교 와이파이 연결 성공은 다른 단계이다.

""" + take(product, [7]) + "\n\n" +
             note("proposed", "제안", "같은 계정의 휴대폰·노트북에서 도감을 공유하는 방식은 아직 검토 중입니다.") + """

## 관계의 핵심

- 사용자 한 명은 여러 기기 세션을 가질 수 있다.
- 네트워크 하나에 여러 AP를 연결할 수 있다.
- 도감 항목 하나에 관리자가 정한 AP들을 연결하는 방식을 제안한다.
- 같은 사용자·같은 도감 항목의 첫 해금은 중복 생성하지 않는다.
- DB 제품·세부 스키마·인덱스·API 경로는 구현 계획에서 정한다.
""", "product/project-planning.md"),

        page("api", "API 설계 메모", "API", "설계", "계약 미확정",
             "필요한 서버 동작의 목록입니다. 배포된 API 명세가 아닙니다.",
             note("proposed", "설계 메모", "URL·요청/응답 스키마·만료 시간·오류 코드의 상세 계약은 구현 계획에서 정합니다.") + """

## 인증과 세션

| 동작 | 요청 주체 | 결과·확인 사항 |
| --- | --- | --- |
| 학교 이메일 인증번호 발송 | 로그인 전 앱 | 도메인·접두어 검증, 재발급 제한 |
| 이메일 인증 확인 | 로그인 전 앱 | 소유 확인 후 사용자·기기 세션 발급 |
| 개인 코드 로그인 | 로그인 전 앱 | 유효 코드에 연결된 사용자로 세션 발급 |
| DataGSM 인증 시작·콜백 | 앱·서버·브라우저 | PKCE·state·등록된 리다이렉트, 인증된 본인 정보 |
| 세션 갱신·로그아웃 | 로그인한 기기 | 회수 가능한 세션 갱신·종료 |
| 내 계정·기기 세션 | 로그인한 사용자 | 자신의 계정·기기 조회 |

## 학교 설정과 도감

| 동작 | 요청 주체 | 결과·확인 사항 |
| --- | --- | --- |
| 설정 버전 확인·수신 | 승인된 앱 | 사용 가능한 네트워크·캐릭터 설정 전달 |
| 도감 항목 조회 | 승인된 앱 | 공개 가능한 캐릭터와 매핑 정보 |
| 수집 결과 동기화 | 로그인한 앱 | 계정 공유 제안 채택 시 도입, 중복 처리 방지 |
| 내 도감 조회 | 로그인한 앱 | 공유를 채택하는 경우 서버 진행도 반환 |

연결 사실은 앱이 OS 상태를 확인해 관찰한다. 수집 기록은 사용자 세션·등록된 AP 매핑·중복 처리 기준과 함께 설계한다.

## 관리자 동작

- 네트워크 목록·등록·수정·비활성화.
- AP 목록·네트워크 매핑·설치 장소 등록·수정.
- 도감 캐릭터·이미지·설명·매핑 관리.
- 사용자·기기 세션 조회와 서비스 접근 회수.
- 개인 코드 발급·회수·재발급.

모든 관리자 동작은 서버에서 권한을 확인한다. 학교 비밀번호·코드 원문·토큰을 로그나 공개 예시에 넣지 않는다.

## 상세 계약에서 정할 것

오류 형태·페이지네이션·설정 버전 충돌·세션 정책·인증번호 수명·코드 재시도 제한·오프라인 수집 동기화를 구체화한다.
"""),

        page("screens", "전체 화면 명세", "SCREEN INVENTORY", "설계", "34종 기본 화면",
             "Android 17종, Windows 6종, 관리자 웹 11종과 상태 변형입니다.",
             note("proposed", "화면 구성안", "기능은 현재 기획을 따르고 시각 기준은 BASE로 통일합니다. 세부 디자인은 개발하면서 다듬습니다.")
             + "\n\n" + "\n\n".join("## " + s["id"] + " " + s["title"] + "\n\n" + s["body"] for s in screen_records),
             "design/2026-10-29-figma-screen-brief.md"),

        page("design", "디자인 시스템", "DESIGN SYSTEM", "설계", "BASE 기준 채택",
             "사용자 지정 팔레트와 타입·간격·모션을 적용합니다.",
             note("fixed", "채택", "흰 바탕, 청록 #0bb7ae, 핑크 #fc6589, 본문 #233237이 기본입니다. 캐릭터의 개별 색은 유지합니다.")
             + "\n\n" + re.sub(r"^# .*\n", "", design, count=1), "design/design-system.md"),

        page("validation", "기술 검증과 완료 기준", "VALIDATION", "진행과 운영", "실기기 검증 대기",
             "문서로 확인한 가능성과 학교·기기에서 확인할 항목을 구분합니다.",
             note("pending", "검증 대기", "관리자·개인 코드 관리와 Windows 계정 앱을 구현했습니다. 실제 DataGSM·교내 Wi-Fi·Android는 검증 전이며, 합성 인증 검사를 학교 사용으로 표시하지 않습니다.")
             + "\n\n" + take(product, [9, 11]) + """

## 검증 기록

| 항목 | 남길 근거 |
| --- | --- |
| 환경 | OS·기기·어댑터·드라이버 |
| 권한 | 허용·거절·복구와 실제 접근 결과 |
| 연결 | 요청과 OS가 보고한 실제 성공·실패 |
| 백그라운드 | 화면 내림·꺼짐·절전·서비스 중단 후 상태 |
| 수집 | 신호 발견만으로 미해금, 실제 연결 후 첫 해금 |
| 복구 | 서버 지연·설정 없음·권한 거절·코드 회수 |
| 개선 효과 | 기본 OS 대비 수동 조작·실패·지연·반복 전환·측정량·배터리 |

Android 제안이 적용되지 않거나 기본 OS보다 개선이 없다면 지원 범위와 제품 약속을 다시 검토한다. 숫자 기준과 주기는 실제 조건 확인 후 정한다.
""", "product/project-planning.md"),

        page("roadmap", "개발 일정과 역할", "ROADMAP", "진행과 운영", "달력 일정 미정",
             "임의의 마감일 대신 단계별 목표와 통과 조건으로 정리합니다.", """
## 현재 위치

운영자·네트워크/AP·개인 코드 관리와 Windows 코드 로그인·보호 저장을 구현했다. Windows 인증은 합성 서버·계정으로 확인했으며 DataGSM 실제 계정·교내 Wi-Fi는 검증 전이다. 학교 이메일·DataGSM 네이티브 복귀·설정 배포·Windows 자동 관리·Android는 후속이다.

## 단계별 목표

| 단계 | 목표 | 다음 단계 조건 | 현재 |
| --- | --- | --- | --- |
| 01 기획 정리 | 기능·정책·데이터·범위 | 남은 제품 제안 검토 | 진행 중 |
| 02 기술 검증 | 학교 망·Windows·Android | 지원 범위·실패 조건 기록 | 대기 |
| 03 공통 기반 | 인증·관리자 등록·설정 배포 | 로그인·권한·설정 흐름 확인 | 대기 |
| 04 Windows | 자동 관리부터 수집까지 | 실제 연결·트레이·수집 확인 | 대기 |
| 05 Android | 허용 범위의 연결·수집 | 알림·화면 꺼짐·관찰 확인 | 대기 |
| 06 교내 사용 | BASE 화면·실패 처리·개선 | 소규모 사용의 완료 기준 충족 | 대기 |

기간과 출시일은 미정이다. 하드웨어·학교 인증·외부 연동 조건을 확인한 뒤 달력 일정으로 구체화한다.

## 역할

| 역할 | 책임 |
| --- | --- |
| 운영자 한 명 | 학교 접속정보·설치 장소 확인, 개인 코드·운영 계정 관리, 제품 결정 |
| 개발 과정 | 앱·서버·웹 구현, BASE 적용, 동작 검증과 문서 갱신 |
| 일반 사용자 | 최초 로그인·권한 동의, 자동 관리 사용, 실제 사용 결과 제공 |

학교 네트워크 담당자나 DataGSM 운영자의 협조는 필요한 경우 확인할 외부 조건이다. 해당 사람에게 이미 업무가 배정됐다고 간주하지 않는다.
"""),

        page("operations", "운영 준비와 비용", "OPERATIONS", "진행과 운영", "운영 전",
             "계정·연동·비용·모니터링을 운영 준비 항목으로 묶습니다.", """
## 외부 연동 준비

| 항목 | 필요한 이유 | 현재 |
| --- | --- | --- |
| DataGSM 클라이언트·콜백 | 학교 계정 로그인 | 문서 확인, 실제 등록·인증 전 |
| 학교 이메일 발송 | 인증번호 전달 | 제공업체·수신 확인 미정 |
| 호스팅·DB | 웹·API·영속 데이터 | 제품·계정·배포 방식 미정 |
| 비밀값·암호화 키 | 접속정보·세션·연동 보호 | 저장·운영 절차 설계 필요 |
| AP 장소·식별 정보 | 정확한 위치·수집 매핑 | 현장 확인 필요 |

## 비용 항목

| 항목 | 계산 기준 | 현재 금액 |
| --- | --- | --- |
| 웹·API | 요청 수·실행 시간·요금제 | 미정 |
| 데이터베이스 | 용량·연결·백업 | 미정 |
| 이메일 | 인증 메일 발송량 | 미정 |
| 이미지·설정 전송 | 저장·다운로드·트래픽 | 미정 |
| 도메인 | 사용 여부·선택 이름 | 미정 |
| 배포·진단 | 배포 경로·진단 보관량 | 미정 |

무료 운영 여부나 월 비용을 지금 확정하지 않는다. 제공업체·예상 이용량을 정한 뒤 당시 공식 요금으로 계산한다.

## 모니터링 방향

- 서버 사용 가능 여부와 API 오류.
- 인증번호 발송 실패·지연, 로그인 실패 증가.
- 설정 수신·동기화 오류.
- 서비스 세션 갱신 실패.
- 선택해 도입하는 도감 동기화의 중복·실패.

전체 AP의 실시간 온라인 상태나 학생 위치를 이미 확인할 수 있다고 가정하지 않는다. 기기 내부 기록과 중앙 서버의 운영 진단을 구분한다.

## 운영 원칙

관리자 인증·복구, 학교 접속정보 변경, 코드 회수·재발급, DB·이미지 백업과 복구 절차를 구현 계획에서 구체화한다. 비밀번호·코드 원문·토큰은 일반 진단 로그에 남기지 않는다.
"""),

        page("decisions", "결정 기록과 남은 항목", "DECISION LOG", "진행과 운영", "확정과 제안",
             "사용자 결정, 기본 제안, 현장 검증 항목을 구분합니다.",
             take(product, [2, 4, 12]) + """

## 상태의 의미

| 상태 | 의미 |
| --- | --- |
| 확정 | 사용자가 선택한 제품 요구 |
| 제안 | 기획 작성자의 기본안, 사용자 확정으로 취급하지 않음 |
| 검증 대기 | 학교·기기·외부 계정에서 확인할 조건 |
| 구현 전 | 문서·설계는 있으나 제품 동작은 아직 만들지 않음 |

문서 기준일은 2026-10-29이다. 이를 모든 결정의 발생일이나 출시일로 사용하지 않는다.
""", "product/project-planning.md"),

        page("research", "DataGSM 조사 기록", "INTEGRATION RESEARCH", "참고", "공식 문서 확인",
             "OAuth 본인 정보와 별도 OpenAPI, 서비스 활용 범위를 구분합니다.",
             re.sub(r"^# .*\n", "", research, count=1), "research/2026-10-29-datagsm-data.md"),

        page("resources", "원문과 참고 자료", "REFERENCES", "참고", "자료 모음",
             "기획 원문과 공식 기술 자료를 모았습니다.", """
## 프로젝트 원문

- [기획 총괄표](../product/project-planning.md)
- [상세 제품 기획서](../superpowers/specs/2026-10-29-campus-wifi-design.md)
- [전체 화면 명세](../design/2026-10-29-figma-screen-brief.md)
- [디자인 시스템](../design/design-system.md)
- [BASE 원본 자료](../design/references/base-original.md)
- [DataGSM 조사 기록](../research/2026-10-29-datagsm-data.md)
- [운영자 인증 등록·실행 안내](../development/datagsm-auth.md)
- [학교 네트워크·AP 저장소 안내](../development/school-settings.md)
- [개인 코드 발급·기기 세션 안내](../development/personal-invites.md)
- [Windows 계정 앱 실행·검증 안내](../development/windows-client.md)

## 구성 참고

[TEAM GSM SERVER](https://app.notion.com/p/TEAM-GSM-SERVER-c0993fbd192d823a9ca201733be710ab?source=copy_link)의 프로젝트 홈과 하위 문서 분류를 참고했다. 소개·기능명세·정책·설계·일정·운영을 묶는 구성을 활용했다. 해당 프로젝트의 서비스 내용·인원·비용·일정을 우리 프로젝트의 사실로 옮기지 않았다.

## 공식 기술 자료

- [DataGSM OAuth](https://docs.datagsm.kr/oauth)
- [DataGSM PKCE](https://docs.datagsm.kr/oauth/pkce)
- [DataGSM 사용자 정보](https://docs.datagsm.kr/oauth/http/userinfo)
- [Android 네트워크 제안](https://developer.android.com/develop/connectivity/wifi/wifi-suggest)
- [Android Wi-Fi 검색](https://developer.android.com/develop/connectivity/wifi/wifi-scan)
- [Android 실행 서비스](https://developer.android.com/develop/background-work/services/fgs)
- [Windows 연결 요청](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_connection_parameters)
- [Windows Wi-Fi와 위치](https://learn.microsoft.com/en-us/windows/win32/nativewifi/wi-fi-access-location-changes)

## 문서 관리

기능·정책의 기준은 상세 기획서와 기획 총괄표, 시각 기준은 디자인 시스템이다. 이 허브는 그 내용을 읽기 쉽게 묶은 문서이다. 원문 수정 후 빌드 스크립트로 연결된 내용을 다시 반영할 수 있다.
""")
    ]
    return pages, screen_records

