# Releases

Pi Desktop uses GitHub Actions for CI and cross-platform release bundling.

## Workflows

- `.github/workflows/ci.yml`
  - TypeScript checks and frontend build
  - Rust check
- `.github/workflows/release.yml`
  - Builds release artifacts for macOS, Windows, Linux
  - Publishes artifacts to a GitHub Release

---

## Release process (maintainer)

## 1) Ensure main is green

- CI passes
- manual smoke pass completed

## 2) Pick version

Example: `v0.1.0`

## 3) Tag and push

```bash
git checkout main
git pull --ff-only
git tag v0.1.0
git push origin main --tags
```

This triggers the release workflow.

## 4) Review release page

Open GitHub Releases and verify artifacts for:
- macOS (`.dmg`, `.app.tar.gz`)
- Windows (`.msi` / `nsis` bundles)
- Linux (`.AppImage`, `.deb`)

## 5) Edit release notes

Use Highlights / Fixes / Known limitations format.

---

## Manual workflow dispatch

You can run `release.yml` manually from the Actions tab and provide a tag input.

---

## Notes about signing

Current workflow produces unsigned artifacts unless signing secrets/certificates are configured.

For production distribution, configure platform signing:
- macOS: Apple Developer signing + notarization
- Windows: code signing certificate (recommended)
- Linux: optional signature strategy depending on distro/channel
