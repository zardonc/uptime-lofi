---
phase: 11-page-and-functionality-refactor
plan: 07
subsystem: notifications
tags: [cloudflare, d1, hono, react, alerts, notifications, webhook, telegram]
requires:
  - phase: 11-06
    provides: alert rules, alert evaluation state, and alert history events
provides:
  - server-side notification channel storage with redacted admin responses
  - Webhook and Telegram dispatch with per-channel delivery records
  - Settings UI for notification channel management
  - Alerts rule form channel selection from enabled delivery channels
affects: [alerts, settings, internal-api, frontend-api, d1-schema]
tech-stack:
  added: []
  patterns:
    - D1 config JSON with redacted DTO projection for secret-bearing resources
    - injectable fetch dispatcher for provider-independent notification tests
key-files:
  created:
    - backend/migrations/0008_v2_notifications.sql
    - backend/src/routes/notifications.ts
    - backend/src/services/notificationDispatcher.ts
    - backend/tests/notifications/dispatcher.test.ts
    - backend/tests/routes/notifications.test.ts
    - .planning/phases/11-page-and-functionality-refactor/11-07-USER-SETUP.md
  modified:
    - backend/src/routes/internal.ts
    - backend/src/schemas/v2.ts
    - backend/src/services/alertEngine.ts
    - frontend/src/api/client.ts
    - frontend/src/api/types.ts
    - frontend/src/components/AlertsPage.tsx
    - frontend/src/components/Settings.tsx
    - frontend/src/index.css
    - frontend/tests/components/Alerts.test.tsx
    - frontend/tests/components/Settings.test.tsx
    - frontend/tests/mocks/handlers.ts
key-decisions:
  - "Stored per-channel alert delivery outcomes in alert_notification_deliveries instead of overloading alert_events.notification_status."
  - "Kept Email as a visible disabled/reserved channel while allowing Webhook and Telegram as active delivery types."
patterns-established:
  - "Secret-bearing channel config stays in config_json; list/detail DTOs expose only has_secret and redacted_label."
  - "Alert evaluation dispatches pending notification events through an injectable dispatcher and catches provider failures."
requirements-completed: [REQ-11-05, REQ-11-06, REQ-11-10]
duration: 58 min
completed: 2026-05-22
---

# Phase 11 Plan 07: Notifications Summary

**Webhook and Telegram notification channels with server-side secrets, redacted channel APIs, alert delivery records, and admin channel selection**

## Performance

- **Duration:** 58 min
- **Started:** 2026-05-22T16:26:00-07:00
- **Completed:** 2026-05-22T17:24:29-07:00
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- Added D1 notification channel storage and per-alert delivery records.
- Added internal notification channel CRUD/test routes with redacted Webhook and Telegram responses.
- Added a notification dispatcher for Webhook POST and Telegram Bot API delivery with fake-fetch tests.
- Connected alert evaluation to dispatch pending firing/recovery events without crashing scheduled checks on provider failure.
- Added Settings channel management and Alerts rule channel selection for enabled Webhook/Telegram channels, with Email shown as unavailable.

## Task Commits

1. **Task 1: Add notification channel storage and redacted APIs** - `5772578` (feat)
2. **Task 2: Implement Webhook and Telegram dispatcher** - `5772578` (feat)
3. **Task 3: Add notification channel UI in Settings and Alerts** - `5772578` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `backend/migrations/0008_v2_notifications.sql` - Notification channel and delivery record schema.
- `backend/src/routes/notifications.ts` - Internal channel CRUD/test routes and redacted DTO mapping.
- `backend/src/services/notificationDispatcher.ts` - Webhook/Telegram dispatch and delivery recording.
- `backend/src/services/alertEngine.ts` - Dispatch hook for pending firing/recovery alert events.
- `backend/src/routes/internal.ts` - Internal route mount for notifications.
- `backend/src/schemas/v2.ts` - Notification channel request/response schemas.
- `frontend/src/api/types.ts` - Notification channel request/response types.
- `frontend/src/api/client.ts` - Notification channel client methods.
- `frontend/src/components/Settings.tsx` - Notification Channels Settings section.
- `frontend/src/components/AlertsPage.tsx` - Enabled channel picker in alert rule creation.
- `frontend/src/index.css` - Notification Settings and Alerts channel picker styling.
- `frontend/tests/mocks/handlers.ts` - Notification channel MSW state and handlers.
- `backend/tests/routes/notifications.test.ts` - Redaction and Email-reserved route tests.
- `backend/tests/notifications/dispatcher.test.ts` - Fake-provider dispatch tests.
- `frontend/tests/components/Settings.test.tsx` - Channel creation and redaction UI tests.
- `frontend/tests/components/Alerts.test.tsx` - Alerts channel picker tests.

## Decisions Made

- Used a separate `alert_notification_deliveries` table for per-channel success/failure records so existing alert event statuses remain compatible.
- Email is accepted only as a disabled/reserved surface and returns not implemented from dispatch/test behavior.
- Channel response DTOs never echo raw Telegram bot tokens or Webhook header values; they expose `has_secret`, `redacted_label`, and delivery status instead.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- Full backend typecheck still reports pre-existing `rootDir` errors for Pages Function tests imported from outside `backend/`; `backend typecheck:app` and frontend typecheck pass.
- Cloudflare worker tests emit sandbox log/write warnings under Wrangler, but the suites complete successfully.

## User Setup Required

External Telegram and Webhook targets require manual configuration. See `11-07-USER-SETUP.md` for:
- Telegram bot token and chat ID setup.
- Test webhook endpoint setup.
- Manual real-delivery verification steps.

## Verification

- `pnpm --filter backend test -- tests/routes/notifications.test.ts tests/notifications/dispatcher.test.ts` - passed.
- `pnpm --filter frontend test -- tests/components/Settings.test.tsx tests/components/Alerts.test.tsx` - passed.
- `pnpm --filter backend run typecheck:app` - passed.
- `pnpm --filter frontend typecheck` - passed.
- `pnpm --filter backend typecheck` - failed on pre-existing Pages Function `rootDir` test configuration outside this plan.

## Next Phase Readiness

Plan 11-07 is ready for Phase 11-09 integration work. Plan 11-08 can run independently in the same wave; Plan 11-09 can consume notification channels from Settings and alert rules.

---
*Phase: 11-page-and-functionality-refactor*
*Completed: 2026-05-22*
