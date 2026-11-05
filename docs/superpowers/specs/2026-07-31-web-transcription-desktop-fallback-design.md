# Web Transcription Desktop Fallback Design

## Goal

When production Web transcription cannot continue because of a provider failure or a lost browser-only audio file, explain the failure and offer the NarratoAI desktop app as the more stable, higher-efficiency editing path.

This change is a user-facing fallback. It does not change audio extraction, FunASR submission, billing, workflow recovery, or backend infrastructure.

## Scope

The recommendation appears only when all of these conditions are true:

- The application is running as the production Web app, not Electron.
- The failed workflow step is `transcribe`.
- The failure is classified as one of the supported desktop-fallback failures.

Supported failures are:

- Backend workflow error code `provider_unavailable`.
- A FunASR provider failure reported as `InternalError`.
- The existing lost temporary audio error indicating that the extracted browser `File` has been released.
- A repeated transcription failure after the workflow has already attempted the transcription step more than once.

The recommendation must not appear for insufficient Credits, authentication expiry, invalid user input, user cancellation, or failures in unrelated workflow steps.

## User Experience

The existing workflow modal remains open and continues to show the original failure. Directly beneath the failed transcription step, show a contextual recommendation area with:

- Title: `网页端转录暂时无法继续`
- Body: `建议下载 NarratoAI 桌面端进行剪辑，运行更稳定，剪辑效率更高。`
- Primary action: `下载桌面端`
- Secondary action: the modal's existing `关闭任务` or `停止任务` action; do not add a duplicate close control inside the recommendation.

The download does not start automatically. Clicking the primary action opens the configured desktop download URL in a new browser tab using safe external-link attributes. The original error remains visible for diagnosis.

The recommendation is inline rather than a toast so it remains discoverable after the initial failure and stays associated with the affected step.

## Error Classification

Add one pure classifier at the workflow presentation boundary. It accepts the failed step identifier and normalized error information, including status, code, message, and attempt count, and returns whether the desktop fallback should be shown.

Classification rules must prefer structured error codes. Message matching is limited to known legacy or browser-local errors such as the released temporary audio message. Generic `Failed to fetch` alone is not sufficient because it can also represent unrelated authentication or connectivity failures.

Repeated failure means the transcription step's persisted attempt count is greater than one and the latest failure is not billing, authentication, cancellation, or validation related.

## Download Configuration

The desktop download URL must be defined in one environment-backed frontend configuration value rather than embedded in the workflow component. Production deployment must provide the official Windows desktop download or download-page URL.

If the URL is absent or invalid, the recommendation text may still render, but the download button must be hidden or disabled. The UI must not navigate to a guessed URL.

## Components And Data Flow

1. The workflow runner records the existing transcription failure without changing its semantics.
2. The workflow modal reads the failed step record and normalized error metadata.
3. The classifier decides whether the failure qualifies for the desktop fallback.
4. The modal renders the inline recommendation only in production Web mode.
5. The download action opens the configured URL; it does not mutate or resume the workflow.

The classifier and download configuration should remain independent of the modal markup so they can be unit-tested without rendering the full workflow.

## Error Handling

- Preserve the original error text and status.
- Never replace a Credits, login, cancellation, or validation message with the desktop recommendation.
- Do not claim that the desktop app uses fewer Credits.
- Do not automatically retry, stop, delete, or migrate the current Web project.
- Do not show the recommendation inside the desktop application.

## Testing

Add focused tests for:

- `provider_unavailable` on `transcribe` shows the recommendation in production Web mode.
- FunASR `InternalError` shows it.
- The released temporary audio message shows it.
- A qualifying repeated transcription failure shows it.
- Insufficient Credits, authentication, cancellation, validation, and non-transcription failures do not show it.
- Electron mode and non-production Web mode do not show it.
- A valid configured URL renders a working download action.
- A missing or invalid URL does not render an unsafe link.
- The original workflow error remains visible alongside the recommendation.

## Non-Goals

- Changing browser MP3 encoding.
- Uploading source media to the backend for normalization.
- Persisting extracted Web audio.
- Automatically falling back to another ASR provider.
- Changing Credits calculation or consumption.
- Migrating an in-progress Web task into the desktop queue.
