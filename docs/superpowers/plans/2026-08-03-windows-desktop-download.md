# Windows Desktop Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable public Windows desktop release metadata and download endpoints, then expose them as reliable download actions on the NarratoAI home page.

**Architecture:** Extend the backend's existing filesystem-backed `/desktop-updates` service with a resolver that parses `win32/x64/latest.json`, derives and validates the matching installer, and serves metadata or a stable redirect. Add a focused frontend desktop-release service; the home-page hero owns one metadata request and shares its state with the navigation and hero actions.

**Tech Stack:** Go 1.24, Gin, React 19, TypeScript, Mantine 9, Vitest, Testing Library, Playwright, Docker Compose/WSL.

## Global Constraints

- Support Windows 10 and Windows 11 on x64 only.
- Do not display or reserve space for macOS or other platforms.
- Reuse artifacts under `DESKTOP_UPDATE_ROOT/win32/x64`.
- The frontend must never contain a versioned installer URL.
- Keep installer paths server-controlled and reject missing, disabled, malformed, or mismatched releases.
- Implement and verify locally; do not push, publish, tag, or deploy.

## File Structure

Backend repository: `D:/NarratoAI/.worktrees/NarratoAI-SaaS-B-Go-alipay-subscription`

- Modify `internal/server/desktop_updates.go`: parse and validate the latest release, expose metadata, and redirect downloads.
- Modify `internal/server/desktop_updates_test.go`: resolver and route behavior.
- Modify `internal/server/server.go`: register two public routes.

Frontend repository: `D:/NarratoAI/.worktrees/NarratoAI-SaaS-F-alipay-subscription`

- Create `src/features/desktop/services/desktopReleaseService.ts`: metadata request, stable download URL, validation, and size formatting.
- Create `src/features/desktop/services/desktopReleaseService.test.ts`: service tests.
- Modify `src/pages/HomePage.tsx`: shared release state and two responsive download actions.
- Modify `src/pages/HomePage.test.tsx`: visible behavior tests.
- Modify `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx`: reuse the stable download URL in workflow recovery.
- Modify `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.ts`: enforce the stable URL dependency.
- Modify `src/vite-env.d.ts`: remove the obsolete versioned URL variable.
- Modify `.env.local.example`: remove the obsolete versioned URL variable.

---

### Task 1: Expose the latest Windows release

**Files:**
- Modify: `internal/server/desktop_updates_test.go`
- Modify: `internal/server/desktop_updates.go`
- Modify: `internal/server/server.go`

**Interfaces:**
- Consumes: `config.Config.DesktopUpdateRoot`, `resolveDesktopUpdateFile(root, wildcardPath)`.
- Produces: `GET /api/v1/desktop/releases/windows/latest`, `GET /api/v1/desktop/download/windows`.

- [ ] **Step 1: Write failing backend tests**

Add a fixture with a valid schema-v1 `win32/x64/latest.json` for version `0.2.4` and a nine-byte `win32/x64/NarratoAI-PC-Setup-0.2.4.exe`. Assert metadata fields and redirect:

```go
func TestLatestWindowsDesktopReleaseMetadataAndDownload(t *testing.T) {
	root := t.TempDir()
	writeDesktopUpdateFixture(t, root, "win32/x64/latest.json", `{
		"schemaVersion":1,"enabled":true,"version":"0.2.4",
		"releaseDate":"2026-08-03T12:00:00Z",
		"releaseNotes":["Initial desktop release"],"packageSize":42,
		"artifactSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	}`)
	writeDesktopUpdateFixture(t, root, "win32/x64/NarratoAI-PC-Setup-0.2.4.exe", "installer")
	app := newDesktopUpdateTestApp(root)

	metadata := httptest.NewRecorder()
	app.Router().ServeHTTP(metadata, httptest.NewRequest(http.MethodGet, "/api/v1/desktop/releases/windows/latest", nil))
	if metadata.Code != http.StatusOK { t.Fatalf("status = %d, body = %s", metadata.Code, metadata.Body.String()) }
	var release windowsDesktopReleaseResponse
	if err := json.Unmarshal(metadata.Body.Bytes(), &release); err != nil { t.Fatal(err) }
	if release.Version != "0.2.4" || release.FileName != "NarratoAI-PC-Setup-0.2.4.exe" || release.FileSize != 9 {
		t.Fatalf("release = %#v", release)
	}
	if release.DownloadURL != "/api/v1/desktop/download/windows" { t.Fatalf("download_url = %q", release.DownloadURL) }

	download := httptest.NewRecorder()
	app.Router().ServeHTTP(download, httptest.NewRequest(http.MethodGet, "/api/v1/desktop/download/windows", nil))
	if download.Code != http.StatusFound { t.Fatalf("status = %d", download.Code) }
	if got := download.Header().Get("Location"); got != "/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.4.exe" {
		t.Fatalf("Location = %q", got)
	}
}
```

Add subtests expecting `503` for a missing manifest, malformed JSON, `enabled: false`, unsupported schema, invalid version, missing installer, and an escaping installer symlink on platforms that support symlinks.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
go test ./internal/server -run 'TestLatestWindowsDesktopRelease' -count=1
```

Expected: compilation fails because `windowsDesktopReleaseResponse` and the routes do not exist.

- [ ] **Step 3: Implement the resolver and handlers**

Add these types and the resolver to `desktop_updates.go`:

```go
const windowsDesktopDownloadPath = "/api/v1/desktop/download/windows"
var desktopVersionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

type desktopReleaseManifest struct {
	SchemaVersion int       `json:"schemaVersion"`
	Enabled       bool      `json:"enabled"`
	Version       string    `json:"version"`
	ReleaseDate   time.Time `json:"releaseDate"`
}

type windowsDesktopReleaseResponse struct {
	Platform string `json:"platform"`
	Architecture string `json:"architecture"`
	Version string `json:"version"`
	FileName string `json:"file_name"`
	FileSize int64 `json:"file_size"`
	PublishedAt time.Time `json:"published_at"`
	DownloadURL string `json:"download_url"`
}
```

`resolveLatestWindowsDesktopRelease(root)` must resolve `/win32/x64/latest.json` through `resolveDesktopUpdateFile`, decode no more than 64 KiB, require schema `1`, `enabled: true`, semantic version, and a nonzero release date, derive `NarratoAI-PC-Setup-<version>.exe`, resolve that path through the same safe helper, and use the installer's actual `os.FileInfo.Size()`.

```go
func resolveLatestWindowsDesktopRelease(root string) (windowsDesktopReleaseResponse, error) {
	manifestPath, _, ok := resolveDesktopUpdateFile(root, "/win32/x64/latest.json")
	if !ok { return windowsDesktopReleaseResponse{}, errors.New("desktop release manifest unavailable") }
	file, err := os.Open(manifestPath)
	if err != nil { return windowsDesktopReleaseResponse{}, fmt.Errorf("open desktop release manifest: %w", err) }
	defer file.Close()
	payload, err := io.ReadAll(io.LimitReader(file, (64<<10)+1))
	if err != nil { return windowsDesktopReleaseResponse{}, fmt.Errorf("read desktop release manifest: %w", err) }
	if len(payload) > 64<<10 { return windowsDesktopReleaseResponse{}, errors.New("desktop release manifest is too large") }
	var manifest desktopReleaseManifest
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return windowsDesktopReleaseResponse{}, fmt.Errorf("decode desktop release manifest: %w", err)
	}
	if manifest.SchemaVersion != 1 || !manifest.Enabled || !desktopVersionPattern.MatchString(manifest.Version) || manifest.ReleaseDate.IsZero() {
		return windowsDesktopReleaseResponse{}, errors.New("desktop release manifest is not publishable")
	}
	name := "NarratoAI-PC-Setup-" + manifest.Version + ".exe"
	_, info, ok := resolveDesktopUpdateFile(root, "/win32/x64/"+name)
	if !ok { return windowsDesktopReleaseResponse{}, errors.New("desktop installer unavailable") }
	return windowsDesktopReleaseResponse{
		Platform: "windows", Architecture: "x64", Version: manifest.Version,
		FileName: name, FileSize: info.Size(), PublishedAt: manifest.ReleaseDate,
		DownloadURL: windowsDesktopDownloadPath,
	}, nil
}
```

Add handlers with this behavior:

```go
func (a *App) latestWindowsDesktopRelease(c *gin.Context) {
	release, err := resolveLatestWindowsDesktopRelease(a.cfg.DesktopUpdateRoot)
	if err != nil {
		log.Printf("resolve latest Windows desktop release: %v", err)
		fail(c, http.StatusServiceUnavailable, "Windows installer is temporarily unavailable")
		return
	}
	ok(c, release)
}

func (a *App) downloadLatestWindowsDesktopRelease(c *gin.Context) {
	release, err := resolveLatestWindowsDesktopRelease(a.cfg.DesktopUpdateRoot)
	if err != nil {
		log.Printf("resolve Windows desktop download: %v", err)
		fail(c, http.StatusServiceUnavailable, "Windows installer is temporarily unavailable")
		return
	}
	c.Redirect(http.StatusFound, "/desktop-updates/win32/x64/"+url.PathEscape(release.FileName))
}
```

Register both unauthenticated routes immediately after creating the `v1` group in `server.go`:

```go
v1.GET("/desktop/releases/windows/latest", a.latestWindowsDesktopRelease)
v1.GET("/desktop/download/windows", a.downloadLatestWindowsDesktopRelease)
```

- [ ] **Step 4: Run focused and package backend tests**

```powershell
go test ./internal/server -run 'TestLatestWindowsDesktopRelease|TestDesktopUpdates' -count=1
go test ./internal/server -count=1
```

Expected: all tests pass.

- [ ] **Step 5: Commit the backend endpoint**

```powershell
git add internal/server/desktop_updates.go internal/server/desktop_updates_test.go internal/server/server.go
git commit -m "feat: expose latest Windows desktop download"
```

---

### Task 2: Add the frontend desktop release service

**Files:**
- Create: `src/features/desktop/services/desktopReleaseService.test.ts`
- Create: `src/features/desktop/services/desktopReleaseService.ts`
- Modify: `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx`
- Modify: `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `VITE_API_BASE_URL` and the public metadata endpoint.
- Produces: `WindowsDesktopRelease`, `getLatestWindowsRelease()`, `getWindowsDownloadUrl()`, `formatDesktopPackageSize(bytes)`.

- [ ] **Step 1: Write failing service tests**

```ts
describe('desktopReleaseService', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllEnvs())

  it('loads Windows release metadata', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      platform: 'windows', architecture: 'x64', version: '0.2.4',
      file_name: 'NarratoAI-PC-Setup-0.2.4.exe', file_size: 129394278,
      published_at: '2026-08-03T12:00:00Z',
      download_url: '/api/v1/desktop/download/windows',
    }), { status: 200 }))
    await expect(getLatestWindowsRelease()).resolves.toMatchObject({ version: '0.2.4' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/desktop/releases/windows/latest',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('builds the stable download URL', () => {
    expect(getWindowsDownloadUrl()).toBe('https://api.example.test/api/v1/desktop/download/windows')
  })

  it('formats package size', () => {
    expect(formatDesktopPackageSize(129394278)).toBe('123 MB')
  })
})
```

Also assert rejection for non-2xx responses, invalid response fields, and zero/negative package sizes.

- [ ] **Step 2: Run the service test and verify RED**

```powershell
npm test -- --run src/features/desktop/services/desktopReleaseService.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the service**

```ts
export interface WindowsDesktopRelease {
  platform: 'windows'
  architecture: 'x64'
  version: string
  file_name: string
  file_size: number
  published_at: string
  download_url: '/api/v1/desktop/download/windows'
}

const apiUrl = (path: string) => `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')}${path}`
export const getWindowsDownloadUrl = () => apiUrl('/api/v1/desktop/download/windows')

export async function getLatestWindowsRelease(): Promise<WindowsDesktopRelease> {
  const response = await fetch(apiUrl('/api/v1/desktop/releases/windows/latest'), {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Windows installer is unavailable')
  const value: unknown = await response.json()
  if (!isWindowsDesktopRelease(value)) throw new Error('Invalid Windows release metadata')
  return value
}

export const formatDesktopPackageSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`
```

Implement `isWindowsDesktopRelease` to require Windows/x64, semantic version, `.exe` file name, positive safe-integer size, valid ISO date, and the exact stable download path. Change the example environment line to:

```ts
function isWindowsDesktopRelease(value: unknown): value is WindowsDesktopRelease {
  if (!value || typeof value !== 'object') return false
  const release = value as Record<string, unknown>
  return release.platform === 'windows'
    && release.architecture === 'x64'
    && typeof release.version === 'string'
    && /^\d+\.\d+\.\d+$/.test(release.version)
    && typeof release.file_name === 'string'
    && release.file_name === `NarratoAI-PC-Setup-${release.version}.exe`
    && typeof release.file_size === 'number'
    && Number.isSafeInteger(release.file_size)
    && release.file_size > 0
    && typeof release.published_at === 'string'
    && !Number.isNaN(Date.parse(release.published_at))
    && release.download_url === '/api/v1/desktop/download/windows'
}
```

Remove `VITE_DESKTOP_DOWNLOAD_URL` from `.env.local.example` and `src/vite-env.d.ts`. In `FrameInferenceSetupStep.tsx`, replace `import.meta.env.VITE_DESKTOP_DOWNLOAD_URL` with `getWindowsDownloadUrl()`. Update `FrameInferenceSetupStep.completion.test.ts` to assert the service call and to assert that `VITE_DESKTOP_DOWNLOAD_URL` no longer appears in the component or Vite environment declarations.

- [ ] **Step 4: Run service tests and TypeScript**

```powershell
npm test -- --run src/features/desktop/services/desktopReleaseService.test.ts
npx tsc -b --pretty false
```

Expected: both commands pass.

- [ ] **Step 5: Commit the service**

```powershell
git add .env.local.example src/vite-env.d.ts src/features/desktop/services/desktopReleaseService.ts src/features/desktop/services/desktopReleaseService.test.ts src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.ts
git commit -m "feat: add Windows desktop release client"
```

---

### Task 3: Add home-page download actions

**Files:**
- Modify: `src/pages/HomePage.test.tsx`
- Modify: `src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: Task 2 service functions.
- Produces: two accessible `下载 Windows 版` actions, metadata copy, and localized failure feedback.

- [ ] **Step 1: Write failing home-page tests**

Mock the service and add:

```ts
it('shows Windows downloads and metadata without macOS copy', async () => {
  vi.mocked(getLatestWindowsRelease).mockResolvedValue({
    platform: 'windows', architecture: 'x64', version: '0.2.4',
    file_name: 'NarratoAI-PC-Setup-0.2.4.exe', file_size: 129394278,
    published_at: '2026-08-03T12:00:00Z',
    download_url: '/api/v1/desktop/download/windows',
  })
  renderHomePage()
  expect(await screen.findByText('Windows 10/11 · 64 位 · v0.2.4 · 123 MB')).toBeVisible()
  expect(screen.getAllByRole('link', { name: '下载 Windows 版' })).toHaveLength(2)
  expect(screen.queryByText(/macOS/i)).not.toBeInTheDocument()
})

it('keeps downloads visible and explains metadata failure', async () => {
  vi.mocked(getLatestWindowsRelease).mockRejectedValue(new Error('offline'))
  const user = userEvent.setup()
  renderHomePage()
  const buttons = await screen.findAllByRole('button', { name: '下载 Windows 版' })
  await user.click(buttons.at(-1)!)
  expect(screen.getByRole('alert')).toHaveTextContent('Windows 安装包暂时无法下载，请稍后重试')
})
```

Keep Credits pricing assertions in a separate existing test. Add `renderHomePage()` and reset service mocks between tests.

- [ ] **Step 2: Run the home-page test and verify RED**

```powershell
npm test -- --run src/pages/HomePage.test.tsx
```

Expected: FAIL because the actions do not exist.

- [ ] **Step 3: Implement shared hero state and actions**

In `HeroSection`, load metadata once using `useEffect` with an unmounted guard. Pass availability into `HeroNavbar`. Add a reusable `WindowsDownloadAction` that renders a link to `getWindowsDownloadUrl()` only after valid metadata loads; otherwise it renders a button whose click sets the error.

Replace the single hero action with a responsive group and stable metadata/error row:

```tsx
<Stack gap="sm" align="center" mih={112}>
  <Group justify="center" gap="md" wrap="wrap">
    <HeroActionButton tone="light" />
    <WindowsDownloadAction available={Boolean(release)} onUnavailable={() => setDownloadError(true)} variant="hero" />
  </Group>
  {release && (
    <Text size="sm" c="rgba(255,255,255,0.72)" ta="center">
      Windows 10/11 · 64 位 · v{release.version} · {formatDesktopPackageSize(release.file_size)}
    </Text>
  )}
  {downloadError && <Text role="alert" size="sm" c="red.3">Windows 安装包暂时无法下载，请稍后重试</Text>}
</Stack>
```

Use `ArrowDownTrayIcon`. The navigation action is visible from `md`; the hero action is always visible. Use stable button dimensions and existing pill styles. Do not add a loading skeleton, macOS text, platform selector, or instructional copy.

- [ ] **Step 4: Run focused tests, full tests, and build**

```powershell
npm test -- --run src/pages/HomePage.test.tsx
npm test -- --run
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Commit the home-page UI**

```powershell
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx
git commit -m "feat: add Windows downloads to home page"
```

---

### Task 4: Verify local artifacts, APIs, and responsive layout

**Files:**
- Modify only when a verification failure has a failing regression test first.

**Interfaces:**
- Consumes: local WSL Docker deployment and staged Windows `0.2.4` release.
- Produces: local verification evidence; no production release.

- [ ] **Step 1: Confirm release artifacts in the API container**

```powershell
wsl.exe -d Ubuntu -- docker exec narratoai-api sh -lc 'test -r /app/data/desktop-updates/win32/x64/latest.json && test -r /app/data/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.4.exe'
```

Expected: exit zero. If absent, copy the already-built `NarratoAI-PC/out/update-feed/win32/x64` files into the configured ignored local host directory.

- [ ] **Step 2: Rebuild local containers**

```powershell
wsl.exe -d Ubuntu -- bash -lc "cd /mnt/d/NarratoAI/.worktrees/NarratoAI-SaaS-B-Go-alipay-subscription && docker compose up -d --build && cd /mnt/d/NarratoAI/.worktrees/NarratoAI-SaaS-F-alipay-subscription && docker compose up -d --build"
```

Expected: backend, database, and frontend containers run normally.

- [ ] **Step 3: Verify metadata, redirect, and installer response**

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/desktop/releases/windows/latest
Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 http://127.0.0.1:8000/api/v1/desktop/download/windows
Invoke-WebRequest -UseBasicParsing -Method Head http://127.0.0.1:8000/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.4.exe
```

Expected: Windows/x64/v0.2.4 metadata, a `302` to the versioned installer route, and installer `HEAD` status `200` with positive `Content-Length`.

- [ ] **Step 4: Verify desktop and mobile layouts with Playwright**

Run a focused check against `http://127.0.0.1:8080/` at `1440x900` and `390x844`; save screenshots under `test-results/windows-download/`. Assert visible actions fit their containers, no actions overlap account controls or each other, metadata appears after loading, the hero video is nonblank, and no macOS copy exists.

- [ ] **Step 5: Run final repository checks**

Backend:

```powershell
go test ./...
git status --short
```

Frontend:

```powershell
npm test -- --run
npm run lint
npm run build
git status --short
```

Expected: all verification commands pass and only intentional commits plus pre-existing user-owned files remain. Stop without pushing or deploying.
