# macOS distribution

## Current status

LocalMD can build an Apple Silicon application bundle and disk image on macOS.

The current artifacts are for local testing. They do not have a Developer ID signature or Apple notarization. Do not publish them as a public release.

## Public release path

Use a signed and notarized disk image for the first public macOS release.

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

Tauri requires code signing for macOS distribution. Direct downloads also require Apple notarization. See the [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) and [Tauri DMG guide](https://v2.tauri.app/distribute/dmg/).

## Direct download

The primary website action should download the GitHub Release disk image. Users then open it and drag LocalMD into Applications.

Use stable asset names that include the version and architecture:

```text
LocalMD_0.2.0_aarch64.dmg
LocalMD_0.2.0_x64.dmg
```

Do not publish the Intel asset until its build and runtime pass on Intel hardware. A later universal disk image can replace the two architecture-specific assets after verification.

## Command-line download

Users who prefer `curl` can download the same signed disk image:

```sh
curl -fL -o LocalMD.dmg \
  https://github.com/lakshayxi/LocalMD/releases/download/v0.2.0/LocalMD_0.2.0_aarch64.dmg
open LocalMD.dmg
```

Do not provide a `curl | sh` installer for the macOS application. A script would add another privileged installation path without improving the signed disk image.

## Homebrew Cask

Homebrew Cask is the recommended command-line installation method:

```sh
brew tap lakshayxi/tap
brew install --cask localmd
```

Create a separate `lakshayxi/homebrew-tap` repository when the first signed release exists. Add this file at `Casks/localmd.rb`:

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

Homebrew verifies the downloaded disk image against the Cask checksum. Follow the [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) when adding Intel or universal artifacts.

## Release automation

A later release workflow should run on a version tag. It should:

1. Run browser and desktop checks.
2. Import the Developer ID certificate into a temporary keychain.
3. Build and notarize the application with Tauri.
4. Verify the signature with `codesign`.
5. Verify the notarization ticket with `spctl`.
6. Generate the SHA-256 checksum.
7. Upload the disk image and checksum to the matching GitHub Release.

Store certificates and notarization credentials in GitHub Actions secrets. Never add them to the repository.

## Release gate

Do not call a disk image public-ready until all of these checks pass:

- the application has a valid Developer ID signature
- Apple notarization succeeds
- the release workflow staples the notarization ticket
- Gatekeeper accepts the downloaded application
- Open, Edit, Save, Save As, and conflict protection pass in the packaged application
- close and quit protect unsaved work
- the packaged application contains the final LocalMD icon
- the release asset checksum matches the Homebrew Cask
