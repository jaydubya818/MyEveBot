# Deferred Telegram campaign test source

Original paths: `apps/eve/test/telegram-owner-qualification.test.mjs` and `telegram-owner-receipts.integration.mjs`, exact source `7bbf296f40ba61031f6e757b0d62929c3c95378d` (origin/codex/digital-worker-integration).

These tests exercise `localTelegramQualificationChannel`, `sendQualifiedTelegramReply` and `TelegramOwnerReceiptStore`, which are absent from the selected Beta implementation. The channel campaign is deferred; copying the older Telegram runtime would replace the selected channel and change authority. Source is retained here unchanged and on its remotely preserved branch. Run from the original paths only with that complete historical source dependency closure. No Telegram qualification PASS is claimed for this consolidation candidate.

The initial recovery run's import failure is retained in qualification/root-q37.log. Moving these tests out of automatic discovery records a scope decision, not a bug fix or successful channel test. Existing selected-channel security tests remain required.
