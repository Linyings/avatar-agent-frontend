# Windows Desktop Download Design

## Goal

Expose a reliable Windows 64-bit NarratoAI desktop download on the public home page. The web application must use a stable backend URL so future desktop releases do not require a frontend release.

## Scope

- Support Windows 10 and Windows 11 on x64 only.
- Do not display or reserve space for macOS or other platforms.
- Reuse the existing desktop update artifacts hosted below the Windows x64 update source.
- Change and test locally first. Production deployment is outside this work.

## Backend Architecture

Add two public endpoints:

```text
GET /api/v1/desktop/releases/windows/latest
GET /api/v1/desktop/download/windows
```

The latest-release endpoint reads the authoritative Windows update manifest and returns:

```json
{
  "platform": "windows",
  "architecture": "x64",
  "version": "0.2.4",
  "file_name": "NarratoAI-PC-Setup-0.2.4.exe",
  "file_size": 0,
  "published_at": "2026-08-03T00:00:00Z",
  "download_url": "/api/v1/desktop/download/windows"
}
```

`file_size` is expressed in bytes. The concrete version, file name, size, and publication date come from the update source rather than being embedded in the web frontend.

The download endpoint resolves the same manifest and returns an HTTP `302` redirect to the referenced `.exe`. It never accepts a file name or path from the request. Only an HTTPS artifact URL under the configured Windows x64 update-source base URL is eligible.

The update-source base URL is backend configuration. The release resolver is a focused service shared by both handlers so metadata and download behavior cannot drift.

## Failure Handling

Missing manifests, invalid manifest data, disallowed artifact URLs, and unavailable artifacts are logged with their internal cause. Public endpoints return a stable `503 Service Unavailable` response without exposing filesystem paths or upstream credentials.

The home page keeps the Windows download button visible if metadata loading fails. It omits unknown version and size values, and clicking the button displays the localized message `Windows 安装包暂时无法下载，请稍后重试` if the stable download endpoint fails.

## Home Page Experience

Add a compact download action to the public hero navigation and a primary `下载 Windows 版` action alongside `免费开始创作` in the hero action area. Use the project's existing download icon and button conventions.

Below the hero actions, display compact metadata when available:

```text
Windows 10/11 · 64 位 · v0.2.4 · 123 MB
```

The version and formatted package size come from the latest-release endpoint. On narrow screens, the actions stack vertically and the metadata wraps naturally. No macOS label, disabled platform option, platform selector, or future-platform teaser is shown.

The frontend calls only the two stable backend endpoints. It does not parse desktop update manifests and does not contain a versioned installer URL.

## Security

- Do not accept user-controlled artifact paths or file names.
- Require the resolved artifact to use HTTPS and remain under the configured update-source origin and path prefix.
- Require the artifact file name to end in `.exe`.
- Apply bounded upstream timeouts and response-size limits when reading the manifest.
- Do not proxy the installer bytes through the API; redirect to the approved artifact URL.

## Testing

Backend tests cover valid manifest parsing, metadata output, redirect behavior, missing and malformed manifests, missing installers, and rejected off-origin or non-`.exe` artifact URLs.

Frontend tests cover both download actions, metadata rendering, the absence of macOS copy, metadata failure fallback, and the localized download failure message.

Run backend unit tests, frontend unit tests, TypeScript checks, and the production frontend build. Start the local WSL Docker deployment and verify the metadata endpoint, redirect response, real installer download response, desktop layout, and mobile layout. The user performs the final manual download check before any release.
