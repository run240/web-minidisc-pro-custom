# Web MiniDisc Pro Custom 작업 인계 메모

작성일: 2026-08-21

## 프로젝트 위치와 목적

- GitHub: https://github.com/run240/web-minidisc-pro-custom
- 기반 프로그램: ElectronWMD / Web MiniDisc Pro
- 목표: NetMD와 Hi-MD 기능을 유지하면서 SonicStage 시대의 Sony Network Walkman을 함께 관리한다.
- 첫 실기기: Sony NW-A3000 (`USB VID:PID 054c:0269`)

## 오늘 확인된 NW-A3000 동작

- Windows에서 약 20GB FAT32 이동식 드라이브로 마운트된다.
- 루트의 `OMGAUDIO` generation-4 데이터베이스를 읽는다.
- SonicStage 키링이나 WinUSB 교체 없이 DRM-free 모드로 연결한다.
- MP3 및 ATRAC3plus 352 kbps 전송을 실기기에서 확인했다.
- 곡 삭제와 전체 삭제를 확인했다.
- 오래된 DB 항목 중 실제 OMA 파일이 없는 항목은 목록에서 제외한다.
- 쓰기 전에 OMGAUDIO 메타데이터 백업 위치가 필요하다.
- FAT32의 EPERM/ENOTEMPTY 문제를 피해 전체 삭제 후 빈 DB 초기화가 동작하도록 수정했다.

## 주요 구현 파일

- `src/wmd/networkwm-service.ts`
  - NW-A3000 USB 감지와 마운트 볼륨 연결
  - 키링 없는 DRM-free 경로
  - 업로드·삭제·이름 변경·전체 삭제
- `src/wmd/mounted-networkwm-filesystem.ts`
  - Windows 마운트 드라이브용 파일시스템 어댑터
  - OMGAUDIO 검색, 백업과 복원
  - FAT32 파일 속성·잠금·삭제 재시도 처리
- `docs/NETWORK-WALKMAN-PLAN.md`
  - 다른 SonicStage Walkman으로 확장하기 위한 세대별 계획
- `scripts/inspect-networkwm-mounted.cjs`
  - 연결된 OMGAUDIO 볼륨을 수정하지 않고 검사
- `scripts/test-networkwm-mounted.cjs`
  - 마운트 파일시스템과 삭제/초기화 회귀 테스트
- `scripts/test-security-dependencies.cjs`
  - 의존성 보안 변경 검증

## UI 변경 사항

- NetMD, Hi-MD 카드 아래에 `네트워크 플레이어 연결` 실험 기능을 추가했다.
- Network Walkman 계열 아이콘과 프로그램 대표 아이콘을 변경했다.
- 시작 시 하얀 화면 대신 어두운 로딩 화면을 표시한다.
- A3000 화면을 Hi-MD 화면과 비슷한 가로형 레이아웃으로 정리했다.
- 네트워크 플레이어에서 잘못 보이던 Hi-MD 전용 전송 문구를 분리/수정했다.
- 오류·확인 대화상자를 앱의 어두운 디자인으로 통일했다.

## 알려진 주의점

- 현재 마운트 드라이브 특별 처리는 NW-A3000 PID `0x0269`에 한정돼 있다.
- 다른 SonicStage 기기는 연결 즉시 쓰기를 허용하지 말고 먼저 읽기 전용 진단이 필요하다.
- SonicStage나 다른 음악 관리 프로그램과 동시에 같은 기기를 쓰지 않는다.
- 전송 또는 DB 저장 중 USB 케이블을 분리하지 않는다.
- OpenMG로 암호화된 ATRAC은 키링과 Sony vendor SCSI/WinUSB 경로가 필요할 수 있다.
- `NW-HD1/HD2` 계열 ESYS DB는 OMGAUDIO와 다른 별도 구현 대상이다.
- 원본 `networkwm-js`에서 일부 모델은 실기기 미검증 상태다.

## 다음 작업 권장 순서

1. NW-A3000 하드코딩을 장치 프로필 테이블로 분리한다.
2. 다른 기기를 한 대씩 연결해 VID/PID, 마운트 드라이브, `OMGAUDIO` 또는 `ESYS` 구조를 읽기 전용으로 수집한다.
3. 가장 가까운 NW-A1000/A1200/A60x 계열부터 실기기 fixture를 만든다.
4. 각 모델에서 메타데이터 백업 → 한 곡 전송 → 재연결 → 본체 재생 → 삭제 순으로 검증한다.
5. 기기별 검증이 끝난 경우에만 쓰기 지원 목록에 추가한다.

## 집에서 개발 환경 복원

이 백업에는 `node_modules`가 포함되지 않는다. Node.js와 npm을 설치한 뒤 프로젝트 폴더에서 다음을 실행한다.

```powershell
npm install
npm run test:security-dependencies
npm run test:networkwm-mounted
npm run pack:custom
```

현재 실행 파일은 `build/win-unpacked/Web MiniDisc Pro.exe`이다. `build` 폴더도 백업에 포함돼 있으므로 개발 환경을 설치하기 전에도 실행할 수 있다.

## 현재 Git 상태

- 기준 커밋: `152350d Merge pull request #2 from run240/agent/windows-release-cleanup`
- 오늘 작업은 일부가 아직 커밋되지 않은 working tree 상태이므로 `.git` 폴더와 변경 파일을 함께 보관한다.
- 집에서 먼저 `git status`로 변경 목록을 확인하고, 검증 후 커밋하는 것이 안전하다.

## 오늘 확인한 음악 폴더 규모

대상 폴더:

`E:\2020작업백업\작업\EasySystems\개인\앨범\녹음용음악모음`

- 총 음원: 1,179곡
- 총 재생시간: 약 79시간 47분
- FLAC 1,060곡, MP3 90곡, M4A 24곡, WAV 5곡
- 원본 크기: 약 35.4GiB
- ATRAC3plus 352 kbps 변환 예상 크기: 약 11.8GiB
- 전체 변환/전송 예상 시간: 대략 10~20시간이며 PC 성능에 따라 달라진다.

