# Worktree cleanup manifest

Fresh inspection after canonical publication. Dirty contents and inaccessible paths must be retained. Other-chat managed worktrees are not attached to this chat and cannot be archived by this chat’s managed-worktree tool; they retain their source and evidence. Unique historical commits remain preserved even where accepted implementation was selectively integrated. Task-owned candidates may be retired after the final audit commit is durable. Stale registrations may be pruned only after preserving their recorded HEAD.

| Path | Branch / SHA | Dirty paths | Unique commits vs main | Disposition |
|---|---|---|---:|---|
| /Users/jaywest/Myeve | refs/heads/main / `a7936898c77d157aa66c222b86aedce07e265e16` | 431 | 1 | KEEP_DIRTY_OR_INACCESSIBLE |
| /private/tmp/knowledge-production-source | refs/heads/codex/knowledge-production / `47aa6ff1bcad9ffdaba0204d078ed3491e345225` | MISSING_REGISTRATION | 1 | PRUNED_STALE_REGISTRATION |
| /private/tmp/myfactory-myeve-main-merge | DETACHED / `f6c645844c009e4e3acdec56b9ad08b72660f670` | MISSING_REGISTRATION | 0 | PRUNED_STALE_REGISTRATION |
| /Users/jaywest/.codex/worktrees/beta-product-experience/Myeve | refs/heads/codex/beta-product-experience / `105aeb75aeb8b01a3bcba09395f32dc1ac0c7c0d` | 0 | 4 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/canonical-consolidation/Myeve | refs/heads/codex/canonical-consolidation / `1dbe3d31ba3b7cd0b3d3a6bfa30b45119cc78489` | 0 | 0 | KEEP_UNTIL_FINAL_AUDIT_COMMIT |
| /Users/jaywest/.codex/worktrees/digital-worker-integration/Myeve | refs/heads/codex/digital-worker-integration / `7bbf296f40ba61031f6e757b0d62929c3c95378d` | 0 | 59 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/gap2-common-ledger/Myeve | refs/heads/codex/p0-gap-02-common-ledger / `f3a5de879ec48a6e65faf9e9dcac9e5441a024c5` | 0 | 24 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/gap2b-projection/Myeve | refs/heads/codex/p0-gap2b-projection / `55544fb797b77bfe9e7ca2a3c11a10ec8535c8f4` | 0 | 27 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/gap2b-qualification/Myeve | refs/heads/codex/p0-gap2b-qualification / `a00e8f46f348a6a38fdb2e9dcae954147aac0d92` | 0 | 41 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/goals-proactive-work/Myeve | refs/heads/codex/goals-proactive-work / `838af27722a500e4e02ae980d71e7541e5575f54` | 0 | 2 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/myeve-beta-integration/Myeve | refs/heads/codex/myeve-beta-integration / `52b3891a2685307cbb50bba97680070700df4cc0` | 0 | 0 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/portable-sofie-capsules/Myeve | refs/heads/codex/portable-sofie-capsules / `3331721f6335829a52b0b0d7fd8f7deca402d79d` | 0 | 6 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/private-alpha-product-expansion/Myeve | refs/heads/codex/private-alpha-product-expansion / `52141ba7d73bdc07f4ceff001b9dfccc5cae40c9` | 0 | 9 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/q37-integration/Myeve | refs/heads/codex/q37-integration / `96ae446e1f0f69e57fa2b9a2b6c5de3b3b1b083d` | 0 | 40 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/q37-private-alpha-continuation/Myeve | refs/heads/codex/q37-private-alpha-continuation / `cf83e3bec6f02ca812b2e08e04c188eaa271bede` | 0 | 61 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/sofie-chat-mainline/Myeve | refs/heads/codex/sofie-chat-mainline / `6ed31375d773f534d8ca9409581bd21bd2d2627a` | 0 | 5 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/sofie-thread-owner-conflict/Myeve | refs/heads/codex/thread-owner-conflict / `fc31671ffc17a660aab575ee7ae67f166fc68877` | 0 | 2 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/total-recall-learning/Myeve | refs/heads/codex/total-recall-learning / `b5b3179e8f7ec61d9a30eb7c24e8bce760bfdcdf` | 0 | 52 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/.codex/worktrees/universal-inbox/Myeve | refs/heads/codex/universal-inbox / `cf199431588d7bc0e95dd24a7d06b63d3b3cd2bb` | 0 | 2 | KEEP_MANAGED_OTHER_CHAT |
| /Users/jaywest/Documents/ChatGPT/MyFactory/data/hosted-myeve | refs/heads/codex/myfactory-hosted-routing / `cab819bdd93ae1470925765728faacf8f6beab25` | 0 | 14 | KEEP_UNIQUE_HISTORY |
