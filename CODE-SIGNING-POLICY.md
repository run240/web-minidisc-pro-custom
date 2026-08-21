# Code signing policy

No signing certificate is currently issued to this project, and current release
binaries are unsigned. If the project is approved for SignPath Foundation
signing, the required attribution will be:

Free code signing provided by
[SignPath.io](https://signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

## Team roles

- Committer and reviewer: [run240](https://github.com/run240)
- Signing-request approver: [run240](https://github.com/run240)

Changes from outside contributors must be reviewed before they are merged.
Future production signing requests will require manual approval by the
signing-request approver.

## Build and release origin

Current unsigned releases may be built locally from this public repository. If
certificate-backed signing is enabled in the future, signing requests will be
built by GitHub-hosted GitHub Actions runners, and the SignPath GitHub connector
will verify the workflow origin before a signing request is accepted.

Only project-owned binaries are submitted for signing. Unsigned upstream
open-source libraries may be included in the application without being signed
by this project's certificate.

## Privacy

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it.

Device information used for NetMD and Hi-MD operation is processed locally.
The project does not operate a telemetry or analytics service.

## Windows system changes

The optional WinUSB installation flow changes the selected MiniDisc device's
Windows driver only after an explicit user action and a Windows elevation
prompt. It uses Windows' own `certutil.exe` and `pnputil.exe` tools. The bundled
driver catalog is signed with the project's self-signed test-driver
certificate, which is added to the Local Machine Root and Trusted Publishers
stores before the driver package is installed. The certificate is used only
for this bundled MiniDisc WinUSB driver package. Users should back up important
recordings before testing.

To remove the application, delete its extracted application directory. To undo
the optional WinUSB driver change, use Windows Device Manager to uninstall the
device/driver and then reconnect the device so Windows can select another
available driver. The certificate can then be removed from the Local Machine
Root and Trusted Publishers stores using its subject name
`Web MiniDisc Pro WinUSB Test Driver`. See `docs/WINDOWS.md` for the complete
removal procedure.
