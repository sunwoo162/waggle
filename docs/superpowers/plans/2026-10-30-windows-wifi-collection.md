# Windows 자동 관리와 도감 Implementation Plan

> superpowers:executing-plans로 직접 구현한다. 전체 브랜치 읽기 전용 리뷰 한 건, 이슈 #22·PR·정확한 커밋 CI를 거친다. 전체 개발 지시가 있으므로 단계 사이에 승인을 다시 묻지 않는다.

**Goal:** Windows 사용자 앱에서 학교 설정을 받아 자동 관리를 시작·중지하고, OS가 확인한 연결로 수집한 그림 도감을 같은 계정과 동기화한다.

**Architecture:** Core의 순수 후보 정책·직렬 coordinator와 Windows Native Wi-Fi 어댑터를 분리한다. 인증된 설정·계정 도감·OS 연결 보고 대기열은 CurrentUser 보호 저장소를 쓴다. WPF는 연결·그림 도감·계정 화면과 트레이를 제공하며 OS 요청 접수와 실제 연결 성공을 구분한다.

**Tech Stack:** 기존 .NET 10 LTS·WPF·DPAPI·HttpClient, wlanapi.dll, System.Windows.Forms.NotifyIcon. WebP는 고정한 SkiaSharp 4.154.0으로 제한된 픽셀을 확인한 뒤 WPF용 PNG로 디코딩한다.

**Spec:** ../specs/2026-10-29-campus-wifi-design.md, ../../product/project-planning.md, ../../design/design-system.md.

## 제약과 구현 판단

- GSM 전용. 도감에는 그림·별명·소개·수집 상태만 둔다. 지도·설치 위치는 관리자 웹 전용이다.
- 실제 OS 상태의 등록 AP/BSSID·정확한 SSID·보안 방식이 맞을 때만 수집한다. 스캔·프로필 설치·연결 요청으로 해금하지 않는다. 이미 연결된 AP도 현재 상태를 확인하면 수집할 수 있다.
- 사용자가 동의하고 관리를 시작해야 와글 이름의 per-user 수동 연결 프로필을 등록·갱신하고 연결 요청한다. 일반 프로필·우선순위·현재 연결을 중지/로그아웃/종료만으로 삭제·해제하지 않는다. 부팅 자동 시작은 넣지 않는다.
- profile 이름은 서비스 origin 해시와 network ID에서 만든다. XML은 메모리에서만 구성하고 로그·파일에 남기지 않는다. WPA3 실패를 WPA2로 낮추지 않는다.
- 현재 품질 45% 이상은 유지한다. 등록된 현재 연결이 35% 미만으로 3번 연속 관찰되고 15%p 이상 나은 45% 이상 후보가 있으면 요청한다. 미연결은 후보가 있으면 시도하고 다른 학교 밖 연결은 유지한다. 요청 간 60초, 결과 대기 30초, 실패 후보 5분 제외가 기본이다. 신호 품질은 속도 측정으로 표시하지 않는다.
- 상태 관찰은 관리 중 10초 간격, 명시적인 scan 요청은 60초보다 자주 하지 않는다. 90초보다 오래된 BSS 후보는 제외한다. Native API의 위치 동의·서비스/무선 꺼짐·드라이버 거부를 우회하지 않는다.
- 설정·도감 갱신은 시작 시와 주기적으로 수행한다. 서버의 계정 재확인이 실패하면 새 연결 요청을 일시 중단하고 기존 OS 연결은 유지한다. 절대 기기 만료 후 새 동작을 하지 않는다.
- 수집 결과는 origin·member ID에 묶은 보호 파일에 먼저 저장한다. 계정별 수집 집합과 AP별 보고 대기열을 중복 없이 유지하고 최대 50개씩 보낸다. 서버에는 반복 접속 시각·이동 경로를 보내지 않는다. 현재 설정과 달라진 보고는 재관찰이 필요하며 비활성 AP는 새 보고에서 제외한다.
- 로그아웃은 엔진 중지 후 세션·설정·수집/대기열의 제거를 모두 시도한다. 하나라도 실패하면 정리 재시도 상태로 두고 새 로그인을 막는다. 앱 종료는 로그아웃이 아니다.
- 중앙으로 보내지 않는 로컬 기록은 최대 200개이며 보호 저장한다. 이미지 캐시는 공개 콘텐츠이며 동시에 2개만 처리하고 메모리 사용량을 제한한다.
- 검사에서는 실제 호스트 Wi-Fi를 조회·스캔·등록·연결하지 않는다. 네이티브 버퍼와 API 대역, 별도 합성 UI 조립으로 검증한다. 실제 학교·위치 권한·드라이버·장시간 실행은 현장 조건으로 남긴다.

## 파일 경계와 인터페이스

- Waggle.Core/Wifi.cs, WifiPolicy.cs: 관찰·후보·실패 계약과 정책. IWifiAdapter의 InterfacesAsync/ObserveAsync/ScanAsync/ConnectAsync는 테스트 대역으로 바꿀 수 있다.
- Waggle.Platform.Windows: wlanapi SafeHandle·반환 버퍼 읽기·NativeWifiBuffers·프로필 XML·BSSID 선호 목록과 이미지 디코더. Windows SDK 10.0.26100의 구조 크기/오프셋을 근거로 검사한다.
- Waggle.Core/Encyclopedia.cs, CollectionSync.cs: 위치 없는 DTO·소유자 검사·실제 연결 보고·원자적 보호 상태. IMemberApi와 MemberSession은 기존 한 번의 갱신·직렬 인증 경계를 재사용한다.
- Waggle.Security.Windows/ProtectedClientStateStore.cs: 도감·수집·보고·로컬 기록을 별도 목적의 DPAPI 파일로 저장.
- Waggle.Core/ClientCoordinator.cs: 로그인·복원·설정/수집 동기화·시작·tick·중지·로그아웃을 직렬화한다. 시간 공급자를 주입해 정책·만료·주기를 검사한다.
- Waggle.Windows: 사용자 연결/도감/계정 화면, 트레이·숨기기/다시 열기·종료, 안전한 이미지 로딩. 자동 시작·서버 관리 UI는 넣지 않는다.

## Review Focus

1. 요청 성공을 연결 성공으로 처리하지 않으며 외부 AP·보안 불일치·오래된 후보를 수집/선택하지 않음.
2. 잘못된 Native 버퍼 길이·SSID·개수·타임스탬프 및 권한 거부에서 메모리/호스트 변경 없이 실패.
3. 느린 저장·토큰 만료·동시 중지/로그아웃·부분 삭제 실패에서 이전 계정 자료나 새 연결 요청이 남지 않음.
4. 오프라인 보고·다른 계정·중복·설정 변경·재실행에서 수집을 거짓 표시하거나 다른 계정으로 보내지 않음.
5. 창 닫기·트레이 재열기·종료와 WebP 오류·대량 그림에서 백그라운드 상태·메모리·UI가 실제 동작과 맞음.

## Task 1 정책과 Native 경계

- [x] WifiPolicyTests에서 정상 유지·3회 저하·후보 차이·비학교 연결·대기/실패 제외·실제 연결만 해금을 먼저 실패시킨다.
- [x] NativeWifiTests에서 SDK 크기(Interface 532/BSS 360/Connection 604)·BSSID 목록 20바이트·길이/개수/SSID/신호 범위·정확한 XML·per-user 플래그와 API 대역을 먼저 실패시킨다.
- [x] Core 계약·정책과 Platform.Windows 어댑터를 구현하고 solution/test 참조·잠금 파일을 준비한다. 실제 wlanapi는 실행하지 않는다.
- [x] windows:check 통과 후 커밋한다.

## Task 2 앱 도감과 보호 대기열

- [x] HTTP DTO/응답 제한·한 번의 갱신·계정별 상태·실제 연결 확인·보호 저장 실패·동시 로그아웃의 회귀 검사를 먼저 실패시킨다.
- [x] MemberApi/MemberSession의 인증된 도감 조회·집합 병합, CollectionSync와 DPAPI 저장을 구현한다. 소유자·스키마·AP 참조·최대 크기를 검증한다.
- [x] 실제 Node 인증/학교/도감 HTTP와 .NET/DPAPI 합성 통합을 확인하고 windows:check 후 커밋한다.

## Task 3 자동 관리 조립

- [x] CoordinatorTests에서 명시적 동의·설정 없음·호출 순서·요청 대기/실패·정상 유지·계정 재확인 장애·만료·로그아웃 정리 실패·중복 tick을 먼저 실패시킨다.
- [x] coordinator에 어댑터·정책·인증/도감·유한한 로컬 기록을 조립하고 시작/중지/상태를 제공한다. 현재 연결을 임의로 해제하는 API는 구현하지 않는다.
- [x] windows:check 통과 후 커밋한다.

## Task 4 WPF와 전달

- [x] 사용자 연결·그림 도감·계정 화면, 동의/시작/중지·동기화·상태·정리 재시도와 트레이를 구현한다. 그림은 제한된 바이트·픽셀로 디코딩하고 미발견은 회색으로 보여준다.
- [x] 실제 WPF를 별도 합성 어댑터·인증/HTTP에 연결해 상태·수집·창 숨기기·중지 후 종료·로그아웃/재실행을 확인한다. 실제 Wi-Fi API는 호출하지 않는다. 자동화가 트레이 영역을 노출하지 않아 트레이 메뉴·재열기는 현장 검증 조건으로 남긴다.
- [x] 운영 안내·진행도·하네스 변경을 반영하고 windows:check, check, build를 통과시킨다.
- [ ] 독립 리뷰 한 건과 필요한 RED→GREEN 수정, PR의 정확한 커밋 CI를 확인하고 병합한다. Android 단계로 이어간다.

## 공식 근거

- [Wi-Fi 위치 접근 변화](https://learn.microsoft.com/en-us/windows/win32/nativewifi/wi-fi-access-location-changes)
- [WlanConnect의 비동기 요청](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/nf-wlanapi-wlanconnect)
- [BSS 구조와 host timestamp](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_bss_entry)
- [프로필 등록](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/nf-wlanapi-wlansetprofile)
- [SkiaSharp 고정 버전](https://www.nuget.org/packages/SkiaSharp/4.154.0)
