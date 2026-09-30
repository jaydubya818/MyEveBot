# Sofie connection qualification — September 30, 2026

Status: IN PROGRESS. Do not interpret setup or local tests as live acceptance.

| Path | Evidence | Status |
| --- | --- | --- |
| Real Mac read, shell approval, screenshot | [Earlier live record](local-mac-access-2026-09-30.md) | PASS for recorded operations |
| Follow-up after completed owner task | Isolated PostgreSQL regression; production retest pending | LOCAL PASS |
| MyFactory hosted intake and signed readback | Existing configuration found; manual host restarted at port 8788 | LIVE RETEST PENDING |
| Relay peer messaging | Active Sofie connection; configured Alpha outbound permission; one bounded test initiated | LIVE RETEST PENDING |
| Muse / GrokBots | Actual recipient addresses and deployments have not been supplied | BLOCKED ON PEER IDENTIFICATION |
| Deep Agents harness | Isolated historical SDK experiment, absent from this release | NOT PRODUCTION-QUALIFIED |

## Change boundaries

Migration 0076 permits fresh owner input after a successfully completed standalone tracked task. It retains the closed task and historical bindings, does not carry approvals into the new run, and leaves delegated/goal/role/scheduled and exhausted-budget recovery restricted. A tool retry cannot request this recovery. Simple README discovery/read/review no longer requires task/skill ceremony.

The dedicated `myfactory` feature enables only MyFactory intake/readback; existing `integrations` configurations retain compatibility. This does not enable coding, merge or publication, other connectors, or broad shell access for external peers.

Local checks: 86 focused tests for owner recovery, local instructions, MyFactory, Relay approval, permission and bounded replies; 7 capability tests; isolated PostgreSQL lifecycle and negative recovery checks. Full type/schema checks and final live outcomes are recorded below when complete.
