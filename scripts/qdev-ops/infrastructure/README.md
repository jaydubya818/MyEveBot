# Isolated QDEV infrastructure preparation

Status: **source configuration and estimate only**. No resource, IAM grant,
credential, tunnel, service installation, paid run or public exposure has been
created. The existing source qualification does not authorize those actions.

Use the existing Mac for the local V4 application, producer and Docker Factory.
Prepare one separately administered ARM64 verifier host in a custodian account,
with the verifier HTTP listener bound only to its loopback interface. An
operator-controlled SSM port-forward supplies the producer's loopback verifier
origin. Use a named Cloudflare tunnel for the two application hostnames. This
preserves the qualified local runtime without adding a serverless execution path.
The Mac remains an availability dependency; this is a bounded beta topology.

## Verifier host

`verifier-host.cloudformation.json` prepares exactly one `c7g.large` (2 vCPU,
4 GiB, ARM64) and one security group. Fixed compute pricing avoids burst-credit
charges or throttling. It has no inbound rules, SSH key, bootstrap script,
verifier service, protected criteria or signing key. Outbound TCP 443 is allowed
for SSM and approved custody dependencies. This is **not** an evaluator sandbox
or proof of network containment. Candidate execution still needs the qualified
runner and the custodian's separate sandbox policy.

The custodian supplies an immutable AL2023 ARM64 HVM EBS AMI with SSM Agent, an
existing dedicated SSM-only instance profile, VPC and public subnet. The profile
must not expose producer, model-provider, signing or secret-store privileges.
Verify the AMI architecture, `/dev/xvda` root device, image owner and image digest
or provenance before creation. The template deliberately has no mutable latest
AMI lookup. `ReviewSourceSha` is an audit tag, not an installation mechanism.

The selected target is **us-east-2**. Template metadata records that choice but
does not enforce region or account selection. Before any authorized creation,
the operator must verify the exact account, region, VPC/subnet relationship,
internet-gateway route, DNS, instance profile and account IAM boundary. A public
IPv4 address provides outbound internet access without a NAT gateway; it does
not open any inbound port. No load balancer, public verifier hostname, Elastic
IP, NAT gateway or broad new IAM role is included.

Use a custodian-approved port-forwarding session restricted to this exact
instance and verifier port. Do not grant the producer SSM shell, Run Command,
remote-host forwarding or host administration. The operator holds its own AWS
identity and the local forward binds only `127.0.0.1`; the application receives
only its verifier bearer credential and loopback origin. The existing
`HttpVerifierPort` still requires that credential and re-verifies the artifact
bound signature using disjoint verifier keys. Session Manager does not record
port-forwarded payloads; retain the verifier's own durable once-only history and
signed evidence. Do not claim a TCP tunnel proves custodian independence.

After separately authorized setup, the custodian installs the exact reviewed
handler/runner and durable store, injects the existing protected evaluator and
its independent signing material, and attests the installation. This template
does not supply or inspect protected evaluator content. A fresh host does not
inherit the local test results: verify ARM64 tools, resource limits, no orphaned
descendants, restart UNKNOWN fencing and signed evidence on that host before a
real run. Do not automatically retry an uncertain evaluation.

## Application access

`cloudflared.example.yml` is an inert named-tunnel example using reserved
`example.invalid` hostnames and a dummy UUID. The two actual approved hostnames,
existing owned DNS zone and scoped tunnel credential remain operator inputs.
The example routes chat to `127.0.0.1:3000` and static delivery to
`127.0.0.1:4318`; set the assembly profile's `publishing.servePort` to 4318 for
this plan. Both origins and metrics must bind only loopback. The static server
uses the existing durable release root and serving-only handler.

There is no route for Factory, Relay, MissionControl, a model proxy, verifier,
database, Docker socket or administration. The final rule returns 404 for every
unmatched hostname. Preserve application authentication, owner/project checks
and signed one-use release approval. A tunnel is not a replacement for them.
Separate Access policy, DNS changes and public exposure need their own scoped
authorization. No tester installation, identity, conversation or allowance is
changed by this plan.

Quick Tunnels cannot carry SSE. A named tunnel streams when the origin sends
`Content-Type: text/event-stream`. Check that header, cache bypass, first event
latency, reconnection to retained progress, disconnect recovery and both tester
sessions through the actual approved TLS host before claiming the journey works.
No real tunnel was opened to perform local ingress validation.

## Public cost estimate, 2026-10-30

`public-compute-price-20261030.json` retains the exact selected row from AWS's
unauthenticated Ohio/Linux price feed, its retrieval time and the full decoded
feed SHA-256. It quotes **USD 0.0723/hour** for `c7g.large`, no preinstalled
software. `estimate-20261030.json` distinguishes this quote from planning rates.
No account credits, free-tier transfer or discounts are assumed.

| Item | Assumption | 72-hour USD |
| --- | --- | ---: |
| EC2 compute | 72 × 0.0723 | 5.2056 |
| One public IPv4 | 72 × 0.005 | 0.3600 |
| Encrypted 20 GiB gp3 | 0.08/GiB-month, 720-hour month | 0.1600 |
| Transfer allowance | 1 GiB × 0.09, planning assumption | 0.0900 |
| EC2 Session Manager | No additional EC2 session fee | 0 |
| Named tunnel plan | Existing owned zone and eligible Free plan assumed | 0 |
| Infrastructure estimate | Before tax and exclusions | **5.8156** |
| Separate model ledger ceiling | Existing proposed QDEV ceiling | **5.2000** |
| Combined planning amount | Does not confer either authority | **11.0156** |

The gp3 rate is AWS's published pricing example, **not a verified Ohio/account
quote**. The transfer rate is a conservative planning assumption, not a quota.
The named tunnel's account eligibility, existing domain and commercial terms
have not been inspected. Confirm those inputs and tax before allocation; no
domain purchase or paid plan upgrade is included. Existing Mac electricity,
network and hardware are excluded. Additional logs, snapshots, storage,
transfers, database upgrades and continued runtime add cost.

The 72-hour window is a plan, **not an installed shutdown timer or billing cap**.
An unchanged host running for 30 days would cost about **USD 57.35**, with the
same storage/IP/1-GiB transfer assumptions. The ledger's USD 5.20 model ceiling
does not limit infrastructure bills. Existing USD 25 infrastructure / USD 30.20
combined design envelopes remain planning amounts, not spend approvals.

## Preparation checks

No cloud credentials are needed:

```sh
node --test scripts/qdev-ops/infrastructure/plan.test.mjs
cfn-lint --regions us-east-2 --template scripts/qdev-ops/infrastructure/verifier-host.cloudformation.json
cloudflared tunnel --config scripts/qdev-ops/infrastructure/cloudflared.example.yml ingress validate
cloudflared tunnel --config scripts/qdev-ops/infrastructure/cloudflared.example.yml ingress rule https://qdev-chat.example.invalid/api/chat
cloudflared tunnel --config scripts/qdev-ops/infrastructure/cloudflared.example.yml ingress rule https://qdev-apps.example.invalid/index.html
cloudflared tunnel --config scripts/qdev-ops/infrastructure/cloudflared.example.yml ingress rule https://wrong.example.invalid/
```

Preparation used cfn-lint 1.59.0 and official cloudflared 2026.10.7. Only local
validation/rule matching ran. The Darwin ARM64 release archive was SHA-256
verified against official release metadata:
`3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd`.
Neither validator confirms live IAM, cloud capacity, TLS, SSE or host isolation.

## Activation and recovery order

1. Freeze integrated source and exact installation tuple. Verify source-only CI
   and protected charter/funding/custody/setup authority already granted for that
   tuple. Reuse existing grants only within their real scope.
2. Verify the target identities, actual quote and custodian independence above.
   No new cloud creation or IAM change is performed by this package.
3. The authorized custodian provisions and records exact resource IDs, installs
   reviewed runtime/schema and scopes enrollment/keys. Preserve all ledgers and
   UNKNOWN records. Use the existing read-only budget preflight before any model
   object or paid request is constructed.
4. Under distinct public/release authority, validate the two named TLS origins,
   authentication, both tester sessions, retained progress and signed release
   approval. Perform the separately authorized bounded real journey once, then
   prove artifact identity, verification, access, recovery and improvement.
5. Before the 72-hour window ends, the authorized operator fences new admission
   and ingress, proves execution quiescence and stops this exact instance while
   retaining evidence/storage. No automatic refund, retry, top-up, charter reset,
   tester migration or generic provider fallback is permitted.

Stopping the instance ends compute charges and releases its automatically
assigned public IP; retained EBS continues billing, about **USD 1.60/30 days** at
the planning rate. Resources use Retain policies and the root disk has
`DeleteOnTermination: false`. Deleting a stack is not a stop or billing control.
Retain source, approvals, ledgers and uncertain evidence. Removing storage is a
separate destructive action after retention requirements and authorization.
Rollback application content with the existing signed exact-release mechanism;
stopping ingress alone does not roll back data or cancel work already running.

## Authoritative references

- [EC2 instance properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html)
- [Security group defaults](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-securitygroup.html)
- [Session Manager access and logging limits](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Session Manager port forwarding](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html)
- [Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [EBS pricing examples](https://aws.amazon.com/ebs/pricing/)
- [EC2 transfer pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [Cloudflare plans](https://www.cloudflare.com/plans/zero-trust-services/)
- [Named tunnel ingress configuration](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Streaming response header](https://developers.cloudflare.com/cloudflare-one/troubleshooting/tunnel/)
