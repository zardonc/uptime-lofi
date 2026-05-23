# Phase 11-07: User Setup Required

**Generated:** 2026-05-22
**Phase:** 11-page-and-functionality-refactor
**Status:** Incomplete

Complete these items to verify real notification delivery. The implementation stores channel secrets server-side and supports testable fake-provider coverage, but real Telegram and Webhook delivery require user-owned external targets.

## Environment Variables

None.

## Dashboard Configuration

- [ ] **Create or provide a Telegram bot token and chat ID**
  - Location: Telegram BotFather and the target chat
  - Notes: Use only test credentials. Do not commit tokens or paste them into source files.

- [ ] **Provide a reachable test webhook URL**
  - Location: Any request-bin style endpoint or controlled test receiver
  - Notes: Use non-sensitive test payloads.

## Verification

After completing setup:

1. Open Settings.
2. Add a Telegram channel with the bot token and chat ID.
3. Add a Webhook channel with the test endpoint.
4. Use each channel's Test action.
5. Create an alert rule using the enabled channels and trigger a test alert condition.

Expected results:
- Telegram receives an alert message.
- Webhook endpoint receives a JSON alert payload.
- Browser responses show redacted channel summaries only.

---

**Once all items complete:** Mark status as "Complete" at top of file.
