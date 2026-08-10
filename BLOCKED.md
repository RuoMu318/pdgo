# Blocked

No unresolved blocker.

Resolved in this branch: Windows CRLF conversion previously changed the raw prompt bytes covered by
external Agent source hashes. The prompt cache now opts out of text conversion; expected hashes were
not rewritten.

Also resolved: concurrent restart recovery previously could race while reclaiming a dead state
lock. Atomic lock-directory acquisition and permanent recovery quarantine now preserve the new live
owner, including under two simultaneous recoverers.
