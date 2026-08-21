# Windows 빌드 및 설치 안내

## 지원 범위

- Windows 10 또는 Windows 11, x64
- Sony NetMD 및 Hi-MD 장치
- 포터블 ZIP 배포판

이 프로젝트의 Windows 배포판은 아직 코드 서명이 적용되지 않았습니다.
Windows SmartScreen 또는 Smart App Control이 실행을 차단할 수 있으며, 이
프로그램을 실행하기 위해 Windows 보안 기능 전체를 끄는 것은 권장하지 않습니다.

## 실행

1. GitHub Releases에서 Windows x64 ZIP과 같은 이름의 SHA-256 파일을 받습니다.
2. SHA-256 파일에 적힌 값과 다운로드한 ZIP의 해시를 비교합니다.
3. ZIP을 새 폴더에 완전히 압축 해제합니다.
4. `Web MiniDisc Pro.exe`를 실행합니다.
5. MiniDisc 기기를 연결하고 NetMD 또는 Hi-MD 모드를 선택합니다.

PowerShell에서 해시를 확인하려면 다음 명령을 사용합니다.

```powershell
Get-FileHash -Algorithm SHA256 '.\Web-MiniDisc-Pro-*-Windows-x64.zip'
```

## WinUSB 드라이버

NetMD와 Hi-MD 장치를 이 앱에서 사용하려면 Windows의 WinUSB 드라이버가
필요합니다. 장치에 WinUSB가 연결되어 있지 않으면 앱이 설치 여부를 묻습니다.

설치에 동의하면 앱은 Windows 기본 도구인 `certutil.exe`와 `pnputil.exe`를
관리자 권한으로 실행합니다. 번들 드라이버 카탈로그를 검증하기 위해
`Web MiniDisc Pro WinUSB Test Driver`라는 자체 서명 인증서가 로컬 컴퓨터의
루트 및 신뢰할 수 있는 게시자 인증서 저장소에 추가됩니다. 이어서 지원되는
MiniDisc USB ID가 포함된 WinUSB 드라이버 패키지가 Windows 드라이버 저장소에
등록됩니다.

이 변경을 원하지 않으면 설치 창에서 **취소**를 선택할 수 있습니다. 설치 중에는
USB 케이블을 분리하지 마세요.

## WinUSB 변경 취소

1. 장치 관리자에서 해당 MiniDisc 장치를 찾습니다.
2. 장치를 제거하면서 드라이버 제거 항목이 표시되면 함께 선택합니다.
3. 다른 지원 장치에서도 이 패키지를 사용하지 않는지 확인합니다.
4. 관리자 PowerShell에서 다음 명령을 실행해 프로젝트 테스트 인증서를 제거합니다.

```powershell
certutil.exe -delstore Root "Web MiniDisc Pro WinUSB Test Driver"
certutil.exe -delstore TrustedPublisher "Web MiniDisc Pro WinUSB Test Driver"
```

인증서를 제거한 뒤 장치를 다시 연결하면 Windows가 사용 가능한 다른 드라이버를
선택할 수 있습니다. Sony 드라이버나 다른 MiniDisc 프로그램을 사용할 예정이라면
해당 프로그램의 드라이버 설치 안내를 따르세요.

## 소스에서 Windows 배포판 만들기

필요한 도구:

- Node.js 20
- PowerShell 5.1 이상

```powershell
npm ci --legacy-peer-deps
npm run test:himd-edit-batch
npm run pack:custom
npm run release:windows
```

검증된 ZIP과 SHA-256 파일은 `build\release`에 생성됩니다. 정식 릴리스 이름을
지정하려면 다음처럼 패키징 스크립트를 직접 실행합니다.

```powershell
.\scripts\package-windows-release.ps1 -ReleaseLabel '1.5.4-Custom-R8'
```
