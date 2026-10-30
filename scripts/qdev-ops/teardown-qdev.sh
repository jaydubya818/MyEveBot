#!/usr/bin/env bash
# SUPERSEDED. The previous version selected every project by name prefix and deleted it, which destroys accounting/witness
# evidence. Use rollback-qdev.sh (non-destructive, default) or delete-qdev.sh (separately approved, exact recorded IDs).
echo "REFUSED: teardown-qdev.sh is superseded; use rollback-qdev.sh (retain) or delete-qdev.sh (separately approved)" >&2
exit 2
