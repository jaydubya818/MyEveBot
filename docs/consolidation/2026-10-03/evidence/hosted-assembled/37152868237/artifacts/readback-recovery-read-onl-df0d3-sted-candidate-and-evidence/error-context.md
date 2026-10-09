# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: readback-recovery.spec.ts >> read-only browser recovery retains the original hosted candidate and evidence
- Location: apps/eve/test/cloud/readback-recovery.spec.ts:9:1

# Error details

```
Error: page.evaluate: Error: Canonical read failed: 409
    at eval (eval at evaluate (:311:30), <anonymous>:3:22)
    at async <anonymous>:337:30
```

# Page snapshot

```yaml
- generic [ref=f2e1]:
  - alert [ref=f2e2]
  - generic [ref=f2e3]:
    - link "Skip to content" [ref=f2e4] [cursor=pointer]:
      - /url: "#owner-content"
    - banner [ref=f2e5]:
      - link "MyEve / Sofie" [ref=f2e6] [cursor=pointer]:
        - /url: /today
      - navigation "Primary" [ref=f2e7]:
        - link "Today" [ref=f2e8] [cursor=pointer]:
          - /url: /today
        - link "Ask Sofie" [ref=f2e9] [cursor=pointer]:
          - /url: /chat
        - link "Work" [ref=f2e10] [cursor=pointer]:
          - /url: /work
        - link "Inbox" [ref=f2e11] [cursor=pointer]:
          - /url: /inbox
        - link "Needs You" [ref=f2e12] [cursor=pointer]:
          - /url: /needs-you
        - link "Agents" [ref=f2e13] [cursor=pointer]:
          - /url: /team
        - link "Rooms" [ref=f2e14] [cursor=pointer]:
          - /url: /rooms
        - generic "Work states" [ref=f2e15]:
          - link "Working" [ref=f2e16] [cursor=pointer]:
            - /url: /inbox?state=Working#work-inbox
          - link "Monitoring" [ref=f2e17] [cursor=pointer]:
            - /url: /inbox?state=Monitoring#work-inbox
          - link "Recent" [ref=f2e18] [cursor=pointer]:
            - /url: /inbox?state=Completed#work-inbox
        - group [ref=f2e19]:
          - generic "More" [ref=f2e20] [cursor=pointer]
        - button "Search and commands (Command K)" [ref=f2e21] [cursor=pointer]:
          - text: Search
          - generic [ref=f2e22]: ⌘K
    - main [ref=f2e23]:
      - generic [ref=f2e24]:
        - generic [ref=f2e25]:
          - text: Your outcomes, in focus
          - heading "Results" [level=1] [ref=f2e26]
          - paragraph [ref=f2e27]: Goals, decisions, evidence, and progress in one place.
        - generic [ref=f2e28]:
          - button "Refresh" [ref=f2e29] [cursor=pointer]
          - link "New Goal" [ref=f2e30] [cursor=pointer]:
            - /url: /work/new
      - group [ref=f2e31]:
        - generic "Private-alpha availability" [ref=f2e32] [cursor=pointer]
      - generic [ref=f2e33]:
        - heading "Implement project slug validation" [level=2] [ref=f2e34]
        - paragraph [ref=f2e35]:
          - generic [ref=f2e36]: PARTIAL
        - paragraph [ref=f2e37]: Canonical Result · Oct 3, 8:42 PM
        - paragraph [ref=f2e38]: "Route: MYFACTORY · Live verification not qualified"
        - paragraph [ref=f2e39]: "Candidate: 282da900fa619caa5993bec37d80758485f28da0"
        - paragraph [ref=f2e40]:
          - link "Review owner decision" [ref=f2e41] [cursor=pointer]:
            - /url: /work/6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4/decision
        - paragraph [ref=f2e42]: Work revision 2 · Criteria revision 1
        - group [ref=f2e43]:
          - generic "Proof of Work" [ref=f2e44] [cursor=pointer]
          - paragraph [ref=f2e45]: "Journey model spend: $0.000000 settled (Sofie $0.000000, Factory $0.000000, native executor $0.000000). Reserved/exposed $0.000000, including UNKNOWN $0.000000. Coverage: COMPLETE. Provider charges outside the model ledger and infrastructure are not represented."
          - list [ref=f2e46]:
            - listitem [ref=f2e47]:
              - strong [ref=f2e48]: PASS
              - text: · trusted-verifier
              - paragraph [ref=f2e49]: native-verification:6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4:282da900fa619caa5993bec37d80758485f28da0:87bf657a-d5b6-4eca-b736-250c80e6e245
          - paragraph [ref=f2e50]: "Result digest: 3c69cdeeba8d1ceba317f8438217d3b4a9445adc4c755ef2a63610682049f30e"
          - list [ref=f2e51]:
            - listitem [ref=f2e52]: factory-candidate:693f48c9-d7ed-4b9e-a614-f26dfb2ac520:sha256:6013aa5c8fe25c49486b2a1bea9855ef668de0258ac20f29b93f8ef7b4a30081
            - listitem [ref=f2e53]: factory-receipt:693f48c9-d7ed-4b9e-a614-f26dfb2ac520
            - listitem [ref=f2e54]: factory-version:7f021fae886ea107d0df98401ccd772c6b893ccc16803d41c9f3ee931c969df9
            - listitem [ref=f2e55]:
              - link "Download retained Factory evidence" [active] [ref=f2e56] [cursor=pointer]:
                - /url: /api/beta/evidence?workId=6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4&resultId=fb8d129e-e25d-4c8b-86cd-678e8d6f0728&reference=factory-evidence%3Asha256%3Acf1d1e6608ae6d275c9a5b57eef6f51e352b0b01f1a33a84871ae87e6264e239
            - listitem [ref=f2e57]:
              - link "Download retained Factory evidence" [ref=f2e58] [cursor=pointer]:
                - /url: /api/beta/evidence?workId=6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4&resultId=fb8d129e-e25d-4c8b-86cd-678e8d6f0728&reference=factory-evidence%3Asha256%3Afd116e9ff13015a43c1f6ee8004eac3915b00aab4cbfcb5d2e2902f35895027b
            - listitem [ref=f2e59]: protected-evidence:sha256:10b94b6f1f43654da5e236cb51c0e5114cab830dd3d985cfdf172e0c9f1ebab4 — referenced by 10 checks
            - listitem [ref=f2e60]: changed-source:fixtures/cloud-work/project-slug/slug.mjs
          - paragraph [ref=f2e61]: Factory-produced candidate in MyEve custody and independent cloud verification only. GitHub publication, CI, review and owner acceptance have not been established.
          - paragraph [ref=f2e62]: "Accounting snapshot at 2026-10-03T20:42:42.979Z; later explanation calls are shown in current journey accounting. Journey model spend: $0.000000 settled (Sofie $0.000000, Factory $0.000000, native executor $0.000000). Reserved/exposed $0.000000, including UNKNOWN $0.000000. Coverage: COMPLETE. Provider charges outside the model ledger and infrastructure are not represented."
        - generic [ref=f2e63]:
          - link "Open Work" [ref=f2e64] [cursor=pointer]:
            - /url: /work?kind=work&id=6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4
          - generic [ref=f2e65]:
            - text: Learning scope
            - combobox "Learning scope" [ref=f2e66]:
              - option "This Work only" [selected]
              - option "Comparable Work in this repository"
          - button "Prefer source citations" [ref=f2e67] [cursor=pointer]
          - link "Review learning" [ref=f2e68] [cursor=pointer]:
            - /url: /memory?workId=6d6b4cc2-af3d-4c96-a46c-84a0089eb6d4
      - generic [ref=f2e69]:
        - heading "Implement project slug validation" [level=2] [ref=f2e70]
        - paragraph [ref=f2e71]:
          - generic [ref=f2e72]: PARTIAL
        - paragraph [ref=f2e73]: Canonical Result · Oct 3, 6:36 AM
        - paragraph [ref=f2e74]: "Route: MYFACTORY · Live verification not qualified"
        - paragraph [ref=f2e75]: "Candidate: 58be5d8b714441f12048d7c98db8be86846a7913"
        - paragraph [ref=f2e76]:
          - link "Review owner decision" [ref=f2e77] [cursor=pointer]:
            - /url: /work/f42d8a79-7c2e-43e3-bd61-2ae1f2cf2cab/decision
        - paragraph [ref=f2e78]: Work revision 2 · Criteria revision 1
        - group [ref=f2e79]:
          - generic "Proof of Work" [ref=f2e80] [cursor=pointer]
        - generic [ref=f2e81]:
          - link "Open Work" [ref=f2e82] [cursor=pointer]:
            - /url: /work?kind=work&id=f42d8a79-7c2e-43e3-bd61-2ae1f2cf2cab
          - generic [ref=f2e83]:
            - text: Learning scope
            - combobox "Learning scope" [ref=f2e84]:
              - option "This Work only" [selected]
              - option "Comparable Work in this repository"
          - button "Prefer source citations" [ref=f2e85] [cursor=pointer]
          - link "Review learning" [ref=f2e86] [cursor=pointer]:
            - /url: /memory?workId=f42d8a79-7c2e-43e3-bd61-2ae1f2cf2cab
      - generic [ref=f2e87]:
        - heading "Implement project slug validation" [level=2] [ref=f2e88]
        - paragraph [ref=f2e89]:
          - generic [ref=f2e90]: PARTIAL
        - paragraph [ref=f2e91]: Canonical Result · Oct 2, 11:52 PM
        - paragraph [ref=f2e92]: "Route: MYFACTORY · Live verification not qualified"
        - paragraph [ref=f2e93]: "Candidate: 89a622482e2664549ec2631cb0549ff2411e8270"
        - paragraph [ref=f2e94]:
          - link "Review owner decision" [ref=f2e95] [cursor=pointer]:
            - /url: /work/373fed29-0d26-474d-a109-f4cef5329847/decision
        - paragraph [ref=f2e96]: Work revision 2 · Criteria revision 1
        - group [ref=f2e97]:
          - generic "Proof of Work" [ref=f2e98] [cursor=pointer]
        - generic [ref=f2e99]:
          - link "Open Work" [ref=f2e100] [cursor=pointer]:
            - /url: /work?kind=work&id=373fed29-0d26-474d-a109-f4cef5329847
          - generic [ref=f2e101]:
            - text: Learning scope
            - combobox "Learning scope" [ref=f2e102]:
              - option "This Work only" [selected]
              - option "Comparable Work in this repository"
          - button "Prefer source citations" [ref=f2e103] [cursor=pointer]
          - link "Review learning" [ref=f2e104] [cursor=pointer]:
            - /url: /memory?workId=373fed29-0d26-474d-a109-f4cef5329847
```