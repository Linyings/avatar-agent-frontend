# Web Transcription Desktop Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a production-Web-only desktop download recommendation when the transcription step fails because the provider is unavailable, FunASR reports an internal failure, browser temporary audio has been released, or a non-excluded transcription failure repeats.

**Architecture:** A pure classifier owns the failure policy and validates the environment-provided download URL. `FrameInferenceSetupStep` evaluates the failed transcription record, tracks repeated failures for the same workflow step during the current page session, and passes an optional recommendation model to the existing shared progress modal, which renders the inline callout without replacing the original error.

**Tech Stack:** React 19, TypeScript 5.8, Mantine 9, Vite 8, Vitest, Testing Library

## Global Constraints

- Do not change audio extraction, FunASR submission, workflow recovery, billing, or backend infrastructure.
- Show the recommendation only for the production Web app and only for `transcribe` failures.
- Do not show it for insufficient Credits, authentication expiry, invalid input, cancellation, or unrelated steps.
- Keep the original error visible.
- Use the exact copy `网页端转录暂时无法继续` and `建议下载 NarratoAI 桌面端进行剪辑，运行更稳定，剪辑效率更高。`
- Do not claim lower Credits usage.
- Never start a download automatically.
- Hide the download action when its configured URL is absent or invalid.
- Preserve unrelated dirty-worktree changes, especially current edits in `aiToolsService.ts` and other shared files.

---

## File Structure

- Create `src/features/projects/components/workflow/desktopFallback.ts`: pure classification and URL validation.
- Create `src/features/projects/components/workflow/desktopFallback.test.ts`: policy matrix tests.
- Modify `src/features/projects/components/workflow/WorkflowProgressModal.tsx`: render an optional inline recommendation.
- Modify `src/features/projects/components/workflow/WorkflowProgressModal.test.tsx`: accessibility, visibility, and link tests.
- Modify `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx`: classify the current transcription failure and wire the modal prop.
- Modify `src/vite-env.d.ts`: declare `VITE_DESKTOP_DOWNLOAD_URL`.
- Modify `.env.local.example`: document the current production installer URL.

### Task 1: Failure Policy And Download Configuration

**Files:**
- Create: `src/features/projects/components/workflow/desktopFallback.ts`
- Create: `src/features/projects/components/workflow/desktopFallback.test.ts`

**Interfaces:**
- Produces: `DesktopFallbackFailureContext`, `DesktopFallbackRecommendation`, and `getDesktopFallbackRecommendation(context, rawDownloadUrl)`.
- Consumes: no React state or browser globals; all runtime facts are explicit inputs.

- [ ] **Step 1: Write the failing classifier tests**

Cover structured provider codes, legacy messages, repeated failures, exclusions, platform/build gates, unrelated steps, and URL validation:

```ts
import { describe, expect, it } from 'vitest'
import { getDesktopFallbackRecommendation } from './desktopFallback'

const base = {
  stepId: 'transcribe',
  errorCode: 'provider_unavailable',
  errorMessage: 'provider unavailable',
  attemptCount: 1,
  isProduction: true,
  isDesktop: false,
}

it('recommends desktop for a production Web provider failure', () => {
  expect(getDesktopFallbackRecommendation(
    base,
    'https://api.narratoai.cn/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.2.exe',
  )).toMatchObject({
    title: '网页端转录暂时无法继续',
    downloadUrl: expect.stringContaining('NarratoAI-PC-Setup-0.2.2.exe'),
  })
})

it.each(['insufficient_credits', 'authentication_required', 'operation_interrupted', 'invalid_request'])(
  'does not recommend desktop for excluded code %s',
  errorCode => expect(getDesktopFallbackRecommendation({ ...base, errorCode }, 'https://example.com/app.exe')).toBeNull(),
)
```

Also assert that `InternalError`, `provider unavailable`, and `临时音频文件已释放` qualify; `attemptCount: 2` qualifies for a generic non-excluded transcription error; development, desktop, unrelated-step, cancellation, and generic `Failed to fetch` with one attempt do not qualify; `javascript:` and malformed URLs yield a recommendation without `downloadUrl`.

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
npx vitest run src/features/projects/components/workflow/desktopFallback.test.ts
```

Expected: FAIL because `desktopFallback.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Use this public shape:

```ts
export interface DesktopFallbackFailureContext {
  stepId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  attemptCount?: number | null
  isProduction: boolean
  isDesktop: boolean
}

export interface DesktopFallbackRecommendation {
  title: '网页端转录暂时无法继续'
  message: '建议下载 NarratoAI 桌面端进行剪辑，运行更稳定，剪辑效率更高。'
  downloadUrl?: string
}

export function getDesktopFallbackRecommendation(
  context: DesktopFallbackFailureContext,
  rawDownloadUrl?: string,
): DesktopFallbackRecommendation | null
```

Normalize code/message to lowercase. Apply gates in this order: production Web and `transcribe`; excluded codes/messages; supported code/message; repeated attempt. Only accept `https:` URLs through `new URL(rawDownloadUrl)` and omit `downloadUrl` when validation fails.

- [ ] **Step 4: Run the focused test and verify green**

Run:

```powershell
npx vitest run src/features/projects/components/workflow/desktopFallback.test.ts
```

Expected: PASS with all classifier cases green.

- [ ] **Step 5: Commit the policy unit**

```powershell
git add src/features/projects/components/workflow/desktopFallback.ts src/features/projects/components/workflow/desktopFallback.test.ts
git commit -m "feat(workflow): classify desktop fallback failures"
```

### Task 2: Inline Recommendation In The Progress Modal

**Files:**
- Modify: `src/features/projects/components/workflow/WorkflowProgressModal.tsx`
- Modify: `src/features/projects/components/workflow/WorkflowProgressModal.test.tsx`

**Interfaces:**
- Consumes: `DesktopFallbackRecommendation` from Task 1.
- Produces: optional `desktopFallback?: DesktopFallbackRecommendation` on `WorkflowProgressModalProps`.

- [ ] **Step 1: Write failing modal behavior tests**

Add tests that pass a recommendation and assert the original error, exact copy, and safe external link coexist:

```tsx
renderModal({
  status: 'error',
  error: 'provider unavailable',
  canClose: true,
  canCancel: false,
  desktopFallback: {
    title: '网页端转录暂时无法继续',
    message: '建议下载 NarratoAI 桌面端进行剪辑，运行更稳定，剪辑效率更高。',
    downloadUrl: 'https://api.narratoai.cn/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.2.exe',
  },
})

expect(screen.getByText('provider unavailable')).toBeVisible()
expect(screen.getByText('网页端转录暂时无法继续')).toBeVisible()
expect(screen.getByText('建议下载 NarratoAI 桌面端进行剪辑，运行更稳定，剪辑效率更高。')).toBeVisible()
expect(screen.getByRole('link', { name: '下载桌面端' })).toHaveAttribute('target', '_blank')
expect(screen.getByRole('link', { name: '下载桌面端' })).toHaveAttribute('rel', 'noopener noreferrer')
```

Add a second case with no `downloadUrl` and assert the copy remains while the link is absent. Preserve existing modal tests unchanged.

- [ ] **Step 2: Run the modal tests and verify red**

Run:

```powershell
npx vitest run src/features/projects/components/workflow/WorkflowProgressModal.test.tsx
```

Expected: FAIL because `desktopFallback` is not a recognized prop and no callout renders.

- [ ] **Step 3: Implement the inline Mantine callout**

Add the optional prop, import `DesktopFallbackRecommendation`, and render after the existing red error alert:

```tsx
{desktopFallback && (
  <Alert color="blue" variant="light" title={t(desktopFallback.title)}>
    <Stack gap="sm">
      <Text size="sm">{t(desktopFallback.message)}</Text>
      {desktopFallback.downloadUrl && (
        <Button
          component="a"
          href={desktopFallback.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          w="fit-content"
        >
          {t('下载桌面端')}
        </Button>
      )}
    </Stack>
  </Alert>
)}
```

Do not add another close/stop button inside the callout. Keep current footer controls authoritative.

- [ ] **Step 4: Run the modal tests and verify green**

Run:

```powershell
npx vitest run src/features/projects/components/workflow/WorkflowProgressModal.test.tsx
```

Expected: PASS, including existing action-policy tests.

- [ ] **Step 5: Commit the modal unit**

```powershell
git add src/features/projects/components/workflow/WorkflowProgressModal.tsx src/features/projects/components/workflow/WorkflowProgressModal.test.tsx
git commit -m "feat(workflow): show desktop fallback prompt"
```

### Task 3: Wire Production Web Failures And Installer Configuration

**Files:**
- Modify: `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx`
- Modify: `src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.tsx`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `getDesktopFallbackRecommendation` from Task 1 and `desktopFallback` prop from Task 2.
- Produces: production Web integration using `VITE_DESKTOP_DOWNLOAD_URL`.

- [ ] **Step 1: Write failing integration tests**

In the existing setup-step test harness, stub production and desktop detection explicitly. Construct a run whose `transcribe` record has `status: 'error'` and `error: 'provider unavailable'`, open the progress modal, and assert the recommendation is visible. Add negative cases for `insufficient credits`, a failed non-transcription step, and desktop mode. Add a repeated-generic-failure case: deliver two distinct failed `transcribe` records for the same workflow run and assert that the first generic failure has no recommendation while the second does.

Use `vi.stubEnv('PROD', true)` only if the harness supports built-in Vite flags; otherwise extract a small `isProductionWeb()` wrapper in `desktopFallback.ts` and mock it in this test. Restore all stubs in `afterEach`.

- [ ] **Step 2: Run the integration test and verify red**

Run:

```powershell
npx vitest run src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.tsx
```

Expected: FAIL because the setup step does not compute or pass a recommendation.

- [ ] **Step 3: Wire the classifier into the Web workflow**

Import `desktopAuthBridge` and `getDesktopFallbackRecommendation`. Keep a page-session failure counter in state and a set of observed failure identities so React re-renders cannot double-count the same record. Update the counter in an effect, never during render:

```ts
const [transcriptionFailureCounts, setTranscriptionFailureCounts] = useState<Record<string, number>>({})
const observedTranscriptionFailuresRef = useRef(new Set<string>())

const transcriptionRecord = displayWorkflowRun?.records.transcribe
const workflowFailureKey = displayWorkflowRun?.workflowRunId ?? projectId
const failureIdentity = transcriptionRecord?.status === 'error'
  ? `${workflowFailureKey}:${transcriptionRecord.completedAt ?? transcriptionRecord.error ?? 'unknown'}`
  : null

useEffect(() => {
  if (!failureIdentity || observedTranscriptionFailuresRef.current.has(failureIdentity)) return
  observedTranscriptionFailuresRef.current.add(failureIdentity)
  setTranscriptionFailureCounts(current => ({
    ...current,
    [workflowFailureKey]: (current[workflowFailureKey] ?? 0) + 1,
  }))
}, [failureIdentity, workflowFailureKey])
```

Derive the recommendation next to `progressItems`:

```ts
const desktopFallback = getDesktopFallbackRecommendation({
  stepId: transcriptionRecord?.status === 'error' ? 'transcribe' : null,
  errorCode: null,
  errorMessage: transcriptionRecord?.error ?? error,
  attemptCount: transcriptionFailureCounts[workflowFailureKey] ?? 0,
  isProduction: import.meta.env.PROD,
  isDesktop: desktopAuthBridge.isDesktop(),
}, import.meta.env.VITE_DESKTOP_DOWNLOAD_URL)
```

Pass `desktopFallback={desktopFallback ?? undefined}` to `WorkflowProgressModal`. The known production failures qualify on their first occurrence by their persisted messages (`provider unavailable` and the released temporary audio message); an otherwise generic transcription error qualifies after its second distinct failure in the same workflow during the current page session. No changes to `aiToolsService.ts` are required, avoiding overlap with existing user edits.

- [ ] **Step 4: Declare and document the URL**

Add to `src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_DESKTOP_DOWNLOAD_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

Add to `.env.local.example`:

```dotenv
VITE_DESKTOP_DOWNLOAD_URL=https://api.narratoai.cn/desktop-updates/win32/x64/NarratoAI-PC-Setup-0.2.2.exe
```

- [ ] **Step 5: Run focused tests and type/build verification**

Run:

```powershell
npx vitest run src/features/projects/components/workflow/desktopFallback.test.ts src/features/projects/components/workflow/WorkflowProgressModal.test.tsx src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.tsx
npm run build
```

Expected: all focused tests PASS; TypeScript and Vite production build exit 0.

- [ ] **Step 6: Check the complete diff and commit integration**

Run:

```powershell
git diff --check
git status --short
```

Confirm only the files in this plan are staged; leave all pre-existing unrelated changes unstaged.

```powershell
git add src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.tsx src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.tsx src/vite-env.d.ts .env.local.example
git commit -m "feat(workflow): recommend desktop after web transcription failure"
```

### Task 4: Final Regression Verification

**Files:**
- Verify only; no planned source edits.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: fresh verification evidence for handoff.

- [ ] **Step 1: Run all directly affected tests together**

```powershell
npx vitest run src/features/projects/components/workflow/desktopFallback.test.ts src/features/projects/components/workflow/WorkflowProgressModal.test.tsx src/features/projects/components/stages/material/steps/FrameInferenceSetupStep.completion.test.tsx src/features/projects/workflow/frame/tests/runner/runFrameWorkflow.test.ts
```

Expected: all test files PASS with zero failed tests.

- [ ] **Step 2: Run the production build**

```powershell
npm run build
```

Expected: `tsc -b`, Vite build, and resource generation all exit 0.

- [ ] **Step 3: Verify commit and worktree boundaries**

```powershell
git log -4 --oneline
git status --short
```

Expected: the feature commits are present; pre-existing unrelated changes remain and no generated build output is staged.
