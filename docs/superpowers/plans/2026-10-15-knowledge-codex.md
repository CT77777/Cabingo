# M2 Knowledge Codex Implementation Plan

> For agentic workers: Use superpowers:executing-plans inline, same agent, as requested.

Goal: Deliver the roadmap M2 learning layer for boarding/preflight without changing scoring or interrupting play.
Architecture: Pure sourced card registry + versioned codex storage, engine-owned per-task judgment summaries independent of the 64-event sound buffer, DOM-only optional result explanations and a menu/result codex modal. Preserve existing navy/mint/cream UI. No network runtime, AI or dependencies.
Spec: docs/design/2026-10-15-handoff-codex-roadmap.md M2 and learning-system-design.md.
User authorization: approved roadmap and repeated continue instructions; no new feature scope approval needed.

## Task 1: Data and records
- [x] Write and run failing tests for every playable task/variant mapping, sources/review marker, encounter-only unlock, judgment aggregation/free retry, no duplicate entries, storage corrupt/future/concurrent cases.
- [x] Implement public/knowledge/index.mjs and public/learning.mjs; add encounters/judgments to engine, unaffected scoring.
- [x] Run rules and learning tests, record verified source scope.

## Task 2: Optional UI
- [x] Write failing production controller tests for collapsed result review, wrong-first ordering, source/review labels, brief/result modal focus + Escape/Tab, no gameplay leakage, persistence denial and refresh.
- [x] Build result explanation details and codex overlay with locked placeholders, category grouping, chapter origin, close/return focus, reset disclosure on fresh run.
- [x] Match existing style; bound scroll regions at desktop1194x959/mobile390x844, keyboard accessibility, do not force result expansion.

## Task 3: Verification and PR
- [x] Full test:all/build/diff check; actual desktop/phone browser review and save evidence.
- [x] Actual Claude Code whole-diff review and fix important findings; update validation and roadmap.
- [x] Commit/push feature only; create and attach independent PR. Never push/merge main.

Review focus: persistent unlock from viewing versus scoring; future storage refusal; long-run wrong attempts beyond event ring; free tutorial retries; native keyboard defaults and focus restoration; source scope not overclaimed; unopened scenarios do not unlock on timeout.
