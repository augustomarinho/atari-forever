# Atari Forever

A browser-based Atari 2600 emulator, available as a web app and as native desktop builds for Windows, macOS, and Linux.

## Run in development mode

Prerequisites: [Node.js](https://nodejs.org/) 22 or newer and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:9000>, then choose or drag a compatible ROM file (`.bin`, `.a26`, or `.rom`) into the app.

## Run a desktop build locally

The desktop app uses Tauri. The first run downloads the Tauri CLI; it also requires Rust and the native dependencies required by Tauri for your operating system.

```bash
npm run desktop:dev
```

To create a production installer for the current operating system:

```bash
npm run desktop:build
```

The installer is written beneath `src-tauri/target/release/bundle/`.

## Download and run release artifacts

Every Git tag in the form `vMAJOR.MINOR.PATCH` (for example, `v1.0.0`) creates a GitHub Release with native artifacts. Open the repository's **Releases** page and download the artifact for your platform.

| Platform | Artifact | How to run |
| --- | --- | --- |
| Windows | `.msi` or `-setup.exe` | Download it, then double-click the installer and follow the prompts. |
| macOS | `.dmg` | Open the disk image, drag **Atari Forever** into **Applications**, then open it. |
| Linux | `.AppImage`, `.deb`, or `.rpm` | Use the package matching your distribution, or make the AppImage executable with `chmod +x Atari-Forever*.AppImage` and run it. |

The emulator does not include game ROMs. Load only ROM files that you are legally entitled to use.

## Create a release

Push a semantic-version tag to GitHub:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The GitHub Actions workflow runs tests, builds each supported desktop platform, and attaches its installers to the GitHub Release for that tag.
