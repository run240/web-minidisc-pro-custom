# Intel macOS Hi-MD RAM Patch v12 릴리스 노트

## 요약

Intel Mac에서 Sony NetMD와 Hi-MD를 하나의 앱으로 사용하기 위한 비공식 테스트 빌드입니다.
macOS가 정상 Hi-MD 저장장치 인터페이스를 점유하는 문제를 우회하기 위해 호환 Sony
펌웨어에 임시 RAM 패치를 적용하고, native IOUSBHost helper로 Hi-MD 통신을 처리합니다.

## v12 주요 변경

- MZ-NH1과 MZ-RH10에서 사용할 수 있도록 제품 번호 고정 대신 펌웨어 기능으로 RAM 패치 판단
- Apple USB 저장장치 드라이버 점유 상태와 IOUSBHost 인터페이스 오류 진단
- Hi-MD 인터페이스 재열기, 연결 종료 정리, 제한 시간 및 전송 멈춤 복구 개선
- 일반 MD를 지우지 않는 `RAM 패치만 적용 (미디어 유지)` 추가
- 파괴적인 Hi-MD 포맷과 비파괴 RAM 패치 절차를 별도 선택지로 분리
- 포맷·모드 변경 중 진행 상태를 표시하고 중복 카드 클릭 차단
- NetMD 복귀 때 남아 있던 잘못된 연결 모드 안내창 흐름 정리
- 99%/REC 점멸 마무리 구간 안내 및 PCM 전송 안정화
- 1만 자 제한 채팅에 전달할 수 있는 압축 진단 정보 복사
- 한국어 오류 설명과 복구 순서 보강

## 실기 확인

- Sony MZ-NH1: NetMD, RAM 패치, Hi-MD 연결, PCM 전송·재생, 모드 복귀
- Sony MZ-RH10: NetMD, 범용 RAM 패치, Hi-MD 연결, PCM 전송·재생, 기존 Hi-MD 교체
- 일반 60/74/80분 MD: Hi-MD 포맷과 NetMD 초기화 왕복
- 운영체제: MZ-NH1은 Intel macOS Sonoma/Tahoe, MZ-RH10은 Intel macOS Tahoe

다른 목록 내 Sony Hi-MD 모델도 호환 펌웨어라면 작동할 가능성이 있지만 아직 실기로
확인하지 않았습니다.

## 설치와 보안

DMG의 앱을 `Applications`로 복사한 뒤 최초 한 번 Control-클릭하여 `열기`를 선택합니다.
이 배포본은 Apple Developer ID 공증을 받지 않은 ad-hoc 서명 빌드입니다. Hi-MD 준비 중
관리자 권한 요청이 나타날 수 있습니다.

## 주의

- 기기 배터리 또는 안정적인 외부 전원이 필요합니다.
- RAM 패치는 완전 전원 차단 시 사라지며 미디어 데이터는 지우지 않습니다.
- `일반 MD를 지우고 Hi-MD로 포맷`과 NetMD 초기화는 모든 곡을 삭제합니다.
- 포맷·녹음·99% 마무리·REC 점멸 중에는 USB와 전원을 분리하지 마세요.
- 1GB Hi-MD 전용 미디어는 NetMD 형식으로 초기화할 수 없습니다.

전체 순서는 [Intel Mac Hi-MD 사용 설명서](INTEL_MAC_HIMD_GUIDE_KO.md)를 참고하세요.

## 배포 파일 확인값

`WMDP Intel Hi-MD RAM Patch v12.dmg`

SHA-256: `1a7fca5e30c7ebdef780e8db5ecf8f1c1de0c8c1dc864b4a3f1b0a02ab3d5e32`
