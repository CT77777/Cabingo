# Cabingo M0 Chapter Framework Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user has selected sequential implementation by the same agent.

**Goal:** Deliver M0 as a reviewable PR without pushing to main.

**Architecture:** Immutable chapter data supplies the existing preflight engine. A pure campaign module normalizes versioned browser data and records formal chapter results. The controller presents available, locked and unfinished chapters while keeping the current preflight game playable.

**Tech Stack:** Existing vanilla ES modules, Three.js, Node tests and Python layout checks; no dependencies.

**Spec:** `docs/design/2026-10-15-handoff-codex-roadmap.md`, M0 and section two decisions.

## Global Constraints

- Baseline is committed v0.4.6; preserve contextual actions, visible coworker, timers and scoring.
- Existing preflight becomes `id: preflight`, order 2, duration 100, handoffTokens 1.
- Boarding is chapter 1 but remains unavailable until M1. M0 keeps preflight accessible.
- Persist only `cabin3d-campaign-v1`; retain legacy audio/best/lesson keys and migrate valid legacy preflight stars.
- Cross-chapter memory uses fixed character IDs and is data-only in M0.
- Actual Claude Code read-only review before push; feature branch and PR only, no merge or main push.
- Preserve the three supplied design documents; correct stale handoff status after verification.

## Review Focus

- Corrupt/null/array/unknown-version storage must fall back without breaking play.
- Unknown, locked or unfinished chapter IDs must never start another chapter accidentally.
- Practice, timeout and zero-star attempts must not advance formal progress.
- Legacy best records must survive migration, and other chapters must never overwrite them.
- Chapter list and long labels must remain usable on narrow/short viewports and keyboard focus.

### Task 1: Chapter registry and preflight extraction

**Files:** Create `public/chapters/preflight.mjs`, `public/chapters/index.mjs`, `tests/chapters.test.mjs`; modify `public/preflight.mjs`, `package.json`.

**Interfaces:** `CHAPTERS`, `getChapter(id)`, `DEFAULT_CHAPTER_ID`; `createState({chapterId:'preflight',...existingOptions})`.

- [x] Test ascending unique IDs/orders, immutable definitions, preflight order2/duration100/six tasks and unsupported IDs rejecting.
- [x] Run `node tests/chapters.test.mjs` and observe missing module failure.
- [x] Move exact existing task and lesson definitions into the frozen preflight data; resolve metadata before seeded task generation.
- [x] Keep unfinished chapters as metadata, never playable placeholders. Run all existing rules and scene tests.

### Task 2: Versioned campaign and fixed-character memory

**Files:** Create `public/campaign.mjs`, `tests/campaign.test.mjs`.

**Interfaces:** `createCampaign()`, `parseCampaign(raw,{legacyBest})`, `recordChapterResult(campaign,result)`, `selectCampaignChapter(campaign,id)` and `updateCharacterMemory(campaign,id,patch)`.

- [x] Test null/malformed/array/unknown version, invalid IDs/stars, legacy migration, failed/practice/no-star attempts, next-chapter unlock, memory isolation and safe fixed-ID patches.
- [x] Run `node tests/campaign.test.mjs` and observe missing module failure.
- [x] Normalize known fields only, keep preflight available during M0, and preserve best stars monotonically. Ignore unknown fields and prototype keys.
- [x] Round-trip valid progress and memory; return fresh safe defaults for incompatible storage. Confirm pure functions do not mutate input.

### Task 3: Chapter selection and controller integration

**Files:** Modify `public/main.js`, `public/index.html`, `public/style.css`, controller/layout tests.

- [x] Add controller tests for chapter numbering/selection, locked click rejection, storage denial, legacy progress and formal-only result recording.
- [x] Load campaign after legacy best parsing; initialize state from the selected playable chapter.
- [x] Render a compact chapter chooser with chapter2 selected and unfinished chapters disabled with lock icons and explanatory text.
- [x] Derive briefing tag, flight chapter label, title, duration and result practice copy from metadata; use the approved learning disclaimer.
- [x] Record successful formal results once per run; keep detailed legacy best scoped to preflight and preserve contextual reset settings.
- [x] Run full tests, build and whitespace check; inspect1194×959 and390×844 in Chrome, including the expanded picker and locked entries.

### Task 4: Review and PR

**Files:** Update handoff status; create `docs/validation/2026-10-15-m0.md`.

- [x] Record baseline and final verification, M0 limits and migration policy.
- [x] Obtain actual Claude Code read-only review; fix findings and rerun affected verification.
- [ ] Commit named files on `feat/chapter-framework`, push that branch only, create PR targeting main and attach it to this chat.
- [ ] Verify main still points to the original base and report the PR link. M1+ remain pending.

### Additional HUD feedback

- [x] Upper aisle alert replaces duplicate idle lower guidance; retain action feedback.
- [x] Hide report marker/button and ignore premature E until `chapterReady`; preserve pure engine rules.
- [x] Regression checks cover desktop and mobile initial state and completed return/report.
