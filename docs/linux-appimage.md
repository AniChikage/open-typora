# Running the Linux AppImage

Use the x64 AppImage from this repository's Releases page and verify its SHA-256 checksum. Make it executable, then run it as your ordinary user. The DEB is the recommended Ubuntu installation, with desktop and file associations included.

```sh
chmod +x Open-Typora-0.17.3-linux-x64.AppImage
./Open-Typora-0.17.3-linux-x64.AppImage
```

## FUSE runtime

The current package uses a FUSE 2 AppImage runtime. Ubuntu 22.04 needs `libfuse2`; Ubuntu 24.04 and newer use `libfuse2t64`. Keep the distribution's existing FUSE 3 package. See the [AppImage project's FUSE instructions](https://github.com/AppImage/AppImageKit/wiki/FUSE).

```sh
# Ubuntu 22.04
sudo apt install libfuse2
# Ubuntu 24.04 and newer
sudo apt install libfuse2t64
```

To inspect a real mount, run `./Open-Typora-0.17.3-linux-x64.AppImage --appimage-mount`. While it remains running, inspect the printed directory with `findmnt --target /printed/mountpoint`. Its filesystem type should start with `fuse`. Press Ctrl+C to unmount. This is different from `--appimage-extract`.

## Ubuntu's user namespace restriction

Chromium also needs a working sandbox. Starting with 0.17.3, the launcher keeps sandboxing enabled instead of silently appending `--no-sandbox` when a namespace probe fails.

On Ubuntu 24.04 with restricted unprivileged user namespaces, an administrator may need to allow namespaces for the verified AppImage. The following example grants that permission only to the exact executable path in the profile; the system-wide restriction stays enabled. Only do this for an AppImage you trust, and update the path after moving or renaming it.

Save this as `/etc/apparmor.d/open-typora-appimage`, replacing the example with your actual absolute AppImage path:

```text
abi <abi/4.0>,
include <tunables/global>
profile open-typora-appimage "/absolute/path/Open-Typora-0.17.3-linux-x64.AppImage" flags=(unconfined) {
  userns,
}
```

Load it with `sudo apparmor_parser -r /etc/apparmor.d/open-typora-appimage`. To remove this permission, run `sudo apparmor_parser -R /etc/apparmor.d/open-typora-appimage` and remove that profile file. A managed machine may require its administrator's policy instead. The application does not install this rule or change system security settings automatically.

## Acceptance scope

The release checks run as an ordinary user in complete Ubuntu 22.04 and 24.04 x64 runner VMs. They verify `/dev/fuse`, an actual FUSE mount, normal AppImage startup from that mount, renderer `NoNewPrivs` and seccomp state, exact Markdown saves, undo/redo, and unmounting after exit. Ubuntu 24.04 uses the application-specific profile above while its global namespace restriction remains enabled. Tests never pass `--no-sandbox`.

This verifies the AppImage runtime and editor under a virtual display. It is not a fresh acceptance of every Linux desktop, display server, IME, or Kubuntu 26.04 configuration. Extracted-payload tests remain separate and are not counted as FUSE coverage.
