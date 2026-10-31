# 와글 Android

Kotlin·Compose 앱입니다. 기획 기준은 [기획 총괄표 1·7절](../../docs/product/project-planning.md)입니다.

## 동작

- 개인 코드로 로그인하면 학교 설정을 받아 Android Keystore로 암호화해 보관합니다.
- **켜기**: 모든 실 Wi-Fi를 OS에 Wi-Fi suggestion으로 등록합니다(SSID 단위, BSSID 미지정, 비밀번호 비공유). 처음 한 번은 OS 허용 창이 뜹니다. 이후 연결은 OS가 하며 앱은 상주하지 않습니다.
- **끄기·로그아웃**: 와글이 등록한 suggestion을 모두 지웁니다(Android 13+는 잠시 유지 후 해제).
- 켜져 있는 동안 WorkManager가 6시간마다 학교 설정을 갱신합니다. 설정 버전은 되돌아갈 수 없습니다.
- 바탕화면 위젯(와글 캐릭터 + 켜기/끄기)과 빠른 설정 타일을 제공합니다. 처음 허용 전에는 앱을 엽니다.
- Wi-Fi 등록 요청: 실 이름·Wi-Fi 이름·보안 방식·비밀번호를 운영자에게 보냅니다.
- 권한: INTERNET, ACCESS_NETWORK_STATE, ACCESS/CHANGE_WIFI_STATE만 씁니다. 위치·알림·포그라운드 서비스·부팅 수신은 없습니다.
- 도감 수집(정밀 위치 필요)은 아직 넣지 않았습니다.

## 명령

```sh
cd apps/android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

JDK 17 이상과 Android SDK(platform 36)가 필요합니다(`ANDROID_HOME`). Windows에서 저장소 경로에 한글이 있으면 Android 도구가 실패하므로 영문 경로의 복사본에서 빌드합니다. CI는 `android-quality`에서 같은 명령을 실행합니다.

## 검증 상태

단위 테스트(설정 검증, 연결 판정, suggestion 계획, 서비스 주소)와 lint·빌드만 통과했습니다. 실기기에서 suggestion 허용 창, 자동 연결, 위젯·타일, 등록 개수 상한은 확인하지 않았습니다. 합성 검사를 실제 학교 사용 증거로 쓰지 않습니다.
