# Old worktree recovery

All old worktree branch commits were incorporated into main before removing
those worktrees. No unmerged local branch tips remained.

`relay-untracked.tar.gz` preserves the 16 untracked duplicate-named source files
from `myeve-relay-federation`. They differed from their neighboring files and
were archived as recovery material rather than installed as competing live
implementations. `relay-untracked.json` records their original relative paths,
sizes and SHA-256 hashes. The archive was read back and all hashes verified.

Ignored local environment/project configuration was backed up separately to
`/private/tmp/myeve-worktree-local-config-backup.tar.gz` with mode 0600. It is not
committed because it can contain credentials. Keep that private backup if those
old local settings are needed; temporary directories are not permanent storage.
