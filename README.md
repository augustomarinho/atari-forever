# Atari Forever

---

<p align="center">
  <img src="public/logo.svg" alt="Atari Forever logo" width="180" />
</p>

<p align="center">
  <a href="https://github.com/augustomarinho/atari-forever/actions/workflows/ci.yml"><img src="https://github.com/augustomarinho/atari-forever/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://augustomarinho.github.io/atari-forever/"><img src="https://img.shields.io/badge/website-Atari%20Forever-f4b927?logo=githubpages&logoColor=171512" alt="Atari Forever website" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22.12-339933?logo=node.js&logoColor=white" alt="Node.js 22.12 or newer" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="Strict TypeScript" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/desktop-Tauri-24C8DB?logo=tauri&logoColor=white" alt="Tauri desktop app" /></a>
  <a href="https://github.com/augustomarinho/atari-forever/releases"><img src="https://img.shields.io/github/v/release/augustomarinho/atari-forever?display_name=tag&sort=semver" alt="Latest release" /></a>
</p>

An Atari 2600 emulator for the browser, with native desktop builds for Windows, macOS, and Linux.

Load a compatible ROM and play directly in the web app, or run Atari Forever as a desktop application. The emulator models the Atari 2600's CPU, video, audio, input, and cartridge hardware in focused TypeScript modules.

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
