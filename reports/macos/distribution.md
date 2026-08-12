# macOS distribution

## Current status

LocalMD builds an Apple Silicon application bundle and disk image on macOS.

v0.2.0 ships as an **unsigned, not-notarized public beta**, distributed directly
through GitHub Releases. This Mac has no Apple Developer Program membership, no
Developer ID Application certificate, and no Apple notarization credentials —
none of that is necessary to host or distribute the disk image. macOS needs it
only to skip its first-launch warning automatically. See "What signing and
notarization change" below for exactly what that warning does and does not
mean.

## Installing v0.2.0

macOS tags a file as downloaded — and subjects it to Gatekeeper's first-launch
check — only when the application that saves it opts into that (Safari,
Chrome, Mail, and similar apps do; `curl` does not). That is not a loophole,
it is how quarantine has always worked, and it changes which install path is
smoothest for an unsigned build.

**Preferred: Terminal.**

```sh
curl -fL -o LocalMD.dmg \
  https://github.com/lakshayxi/LocalMD/releases/download/v0.2.0/LocalMD_0.2.0_aarch64.dmg
open LocalMD.dmg
```

Then drag LocalMD into Applications and open it normally. A file `curl`
writes never gets the quarantine flag, so Gatekeeper's first-launch check
never triggers and the app opens immediately. This is not a security bypass —
`curl` simply never opts into the cooperative tagging browsers use, the same
way `git clone` or `scp` do not either.

Do not provide a `curl | sh` installer. A script would add a privileged
installation path without improving on downloading the disk image and
opening it yourself.

**Alternative: a browser.**

1. Download `LocalMD_0.2.0_aarch64.dmg` from the
   [GitHub Releases page](https://github.com/lakshayxi/LocalMD/releases).
2. Open the disk image and drag LocalMD into Applications.
3. Open LocalMD normally, the same way you would open any application.
4. A browser download does get quarantined, so this build — unsigned, with
   no Developer ID identity — is likely to trigger the harder of macOS's two
   Gatekeeper responses:
   `"LocalMD" is damaged and can't be opened. You should move it to the Trash.`
   That wording is misleading but expected. Testing a quarantined copy of
   this exact build confirmed it: current
   macOS shows this message, with no "Open Anyway" button in **System
   Settings → Privacy & Security**, for an app whose only signature is the ad
   hoc one Tauri's build step applies. Most Gatekeeper guides describe the
   "Open Anyway" recovery flow for a signed-but-unnotarized app — a real
   Developer ID identity, just missing Apple's scan. That is a stronger case
   than this build is in, and its recovery path does not apply here. Do not
   move the app to the Trash; the download is not actually damaged.
5. Recover with Terminal, scoped to this one file:
   ```sh
   xattr -dr com.apple.quarantine /Applications/LocalMD.app
   ```
   Do not run `xattr -cr`, `spctl --master-disable`, or disable Gatekeeper
   globally — those go further than this fix needs and weaken protection for
   every other application on the Mac, not just this one.

## What signing and notarization change

These are three separate things, and only one of them is what an unsigned
beta lacks:

- **GitHub hosting and distribution** work today, signed or not. GitHub
  Releases serves any file you upload; nothing about hosting or downloading
  the disk image requires an Apple certificate.
- **Apple code signing** (a Developer ID Application certificate) attaches a
  verifiable identity to the binary. Without it, the binary carries only its
  linker-generated ad hoc signature, which identifies nothing.
- **Apple notarization** is a separate Apple scan of the signed binary that,
  once it passes, lets Gatekeeper skip its first-launch warning automatically.
  Notarization requires signing first; there is no notarize-without-sign path.
- **Gatekeeper's behavior** is the only thing users actually experience, and it
  has more than one response. A signed-and-notarized app opens with no
  warning. A signed-but-unnotarized app is the case most guides describe: an
  "Open Anyway" button appears in Privacy & Security. This build is neither —
  it carries only an ad hoc signature with no Developer ID identity at all —
  and current macOS answers that case with `is damaged and can't be opened`,
  no "Open Anyway" button included. Gatekeeper does not block installation,
  copying, or running from source — only the ordinary double-click launch path
  it gates, and only for a quarantined copy.

None of this weakens what the application does once it runs. LocalMD's
[privacy claim](../../reports/gate-a-production.md) — no document upload, no
analytics, no remote processing — is a property of the code, not of code
signing, and holds identically whether or not anyone signs the binary.

## Signed and notarized release path (deferred)

Not implemented for v0.2.0. This is the path to remove the Gatekeeper warning
once the project has an Apple Developer Program membership:

1. Join the Apple Developer Program.
2. Create a `Developer ID Application` certificate.
3. Install the certificate in the build keychain.
4. Configure Tauri with the signing identity.
5. Configure Apple notarization credentials.
6. Build the Apple Silicon disk image.
7. Test the downloaded disk image on a clean Mac.
8. Publish the disk image as a GitHub Release asset.
9. Record the SHA-256 checksum.
10. Update the Homebrew Cask with the release version and checksum.

See the [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/)
and [Tauri DMG guide](https://v2.tauri.app/distribute/dmg/).

### Release automation (deferred)

A later release workflow should run on a version tag. It should:

1. Run browser and desktop checks.
2. Import the Developer ID certificate into a temporary keychain.
3. Build and notarize the application with Tauri.
4. Verify the signature with `codesign`.
5. Verify the notarization ticket with `spctl`.
6. Generate the SHA-256 checksum.
7. Upload the disk image and checksum to the matching GitHub Release.

Store certificates and notarization credentials in GitHub Actions secrets.
Never add them to the repository.

## Homebrew Cask (deferred)

Deferred until a signed release exists, so the Cask does not become the first
place a reader hits the unsigned-launch warning without context. Once a
project maintainer signs and notarizes a v0.2.0 successor, create a separate
`lakshayxi/homebrew-tap` repository with this file at `Casks/localmd.rb`:

```ruby
cask "localmd" do
  version "0.2.0"
  sha256 "REPLACE_WITH_RELEASE_DMG_SHA256"

  url "https://github.com/lakshayxi/LocalMD/releases/download/v#{version}/LocalMD_#{version}_aarch64.dmg"
  name "LocalMD"
  desc "Local-first Markdown reader and editor"
  homepage "https://github.com/lakshayxi/LocalMD"

  depends_on arch: :arm64
  depends_on macos: ">= :monterey"

  app "LocalMD.app"
end
```

Homebrew verifies the downloaded disk image against the Cask checksum. Follow
the [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) when adding
Intel or universal artifacts.

## Release asset naming

Use stable asset names that include the version and architecture:

```text
LocalMD_0.2.0_aarch64.dmg
LocalMD_0.2.0_x64.dmg
```

Do not publish the Intel asset until its build and runtime pass on Intel
hardware. A later universal disk image can replace the two
architecture-specific assets after verification.

## Release gate

Do not call a disk image ready for the **v0.2.0 unsigned beta** until all of
these checks pass:

- Open, Edit, Save, Save As, and conflict protection pass in the packaged
  application
- close and quit protect unsaved work with the native `Save` / `Don't Save` /
  `Cancel` alert
- the packaged application contains the final LocalMD icon
- the disk image passes `hdiutil verify`
- the release asset's recorded SHA-256 matches the uploaded file

A **signed and notarized** release additionally requires everything in
"Signed and notarized release path" above, plus a matching Homebrew Cask
checksum. That gate does not apply to v0.2.0.
