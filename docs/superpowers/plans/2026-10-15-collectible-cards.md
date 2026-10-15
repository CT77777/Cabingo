# Collectible Flight Cards

User-requested refinement to open M2 PR #5. Same agent sequential implementation; no main push/merge.

Design: aviation field collection in current navy/mint/gold, cream illustrated card fronts with serial numbers and earned stamps. New factual aviation/safety trivia separated from task coaching; sources attached, unreviewed status retained. Unlock only after a successful scored chapter completion and task.done. Practice, timeout, zero-star and unfinished tasks earn nothing. Existing saved cards preserved. Result reveals only newly earned cards; replay does not duplicate rewards. Keep optional learning explanations available on failed/practice runs.

- [x] RED/GREEN pure reward gates, partial completed-task eligibility, new-card diff, old/future/concurrent save cases.
- [x] Eight original local SVG scenes and sourced trivia; card-front grid, locked backs, result reward strip, safe focus/scroll behavior.
- [x] Production controller reward persistence, no encounter unlock, no replay duplicate and failure storage tests; browser desktop/mobile/keyboard.
- [x] Full tests/build, actual Claude Code review, fix important findings, validation + update PR #5 only.
