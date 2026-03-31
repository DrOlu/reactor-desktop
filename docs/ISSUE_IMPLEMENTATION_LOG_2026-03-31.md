# Issue implementation log (2026-03-31)

This log now covers both implementation tracks completed/advanced on 2026-03-31:

1. **Theme/settings/welcome track** on `feat/66-theme-schema-cli-compat` (merged to `dev` via PR #73)
2. **Chat interface sweep track** on `feat/chat-interface-issue-sweep` (pushed branch, PR creation pending)

---

## Status by affected issue

- **#49** Markdown code-block render integrity — **Implemented (chat sweep branch)**
- **#50** Code-block copy UX polish — **Implemented (chat sweep branch)**
- **#52** Tool-call compact workflow timeline — **Implemented (chat sweep branch)**
- **#53** Composer offset + scroll correctness — **Implemented (chat sweep branch)**
- **#54** Chat overflow/wrapping robustness — **Implemented (chat sweep branch)**
- **#55** Single compaction-cycle UI — **Implemented (chat sweep branch)**
- **#63** Codex parity umbrella — **Partially implemented** (welcome slice merged; chat slice implemented on sweep branch)
- **#66** Theme schema / CLI compatibility — **Merged to dev (PR #73)**
- **#69** Settings pane render hardening — **Merged to dev (PR #73)**
- **#70** Slash action audit/cleanup — **In progress**
- **#72** Tool-result/steer timeline anomalies — **Implemented (chat sweep branch)**

---

## #66 — Theme schema / CLI compatibility

Status: **Merged to `dev` via PR #73**

Implemented:
- Bundled themes now emit full Pi CLI-compatible schema documents (required tokens + schema URL).
- Legacy invalid bundled theme files in `~/.pi/agent/themes/pi-desktop-*.json` are auto-repaired on install/restore.
- Settings “Create theme” now exports full schema-compatible documents.

---

## #69 — Settings pane blank/failed render hardening

Status: **Merged to `dev` via PR #73**

Implemented:
- Deterministic pane open/mount handling with race/rebind guards.
- Safe fallback settings shell when runtime-dependent sections fail.
- No-project settings flow decoupled from runtime-dependent rendering.

---

## #63 — Codex-inspired parity umbrella

Status: **Partial (split across tracks)**

Implemented in merged track (`feat/66...`):
- Centered no-project/new-thread welcome/dashboard redesign.
- Project-focused dropdown with workspace project listing + direct switching.

Implemented in chat sweep branch (`feat/chat-interface-issue-sweep`):
- Compact Codex-style tool workflow summaries.
- Reduced tool chrome with grouped rows and progressive disclosure.
- Improved markdown/code block visual polish and calmer minimalist hierarchy.

---

## Chat interface sweep details (`feat/chat-interface-issue-sweep`)

### #49 / #50 / #54 — Markdown and code rendering + UX

Implemented:
- Ensured fenced code blocks render reliably in chat/file markdown hosts.
- Refined code-block copy affordance (hover/focus behavior, reduced visual noise).
- Suppressed assistant-level copy action when a message is only a fenced code block (copy stays on the code block itself).
- Removed “card-in-card” feel in code blocks; tightened spacing and icon proportions.
- Hardened wrapping and overflow rules to avoid chat-level horizontal overflow for normal prose.

### #52 / #55 / #72 — Tool workflow and compaction timeline stabilization

Implemented:
- Single compact workflow summary per assistant run with duration-centered header.
- Grouped repeated consecutive tool runs; single-open tool detail behavior preserved.
- Compaction updates consolidated into one in-place cycle block.
- Manual-collapse override respected during active runs (no unwanted auto-reopen).
- Collapse behavior now defers to final assistant handoff instead of individual tool completion.
- Removed transient blank placeholder row generation that caused pre-workflow spacing jumps.
- Thinking/tool timeline now supports interleaving order from stream events (not forced top-only).
- Added stronger dedupe for repeated streamed thinking content.
- Improved handling for concurrent running tool groups and inline running indicators.

### #53 — Composer/scroll behavior

Implemented:
- Dynamic composer-aware bottom spacing with `ResizeObserver` and CSS offset variable.
- Maintained “latest” visibility behavior while streaming.

### #70 — Slash actions

Status: **Not complete**

Progress:
- Redundant slash actions already covered by clearer UI entry points were reduced.

Remaining:
- Final curated slash list audit and `/compact`-path validation before closing #70.

---

## Notable chat-sweep commits (latest)

- `9824044` feat(chat): compact workflow timeline + markdown/composer hardening
- `3412b61` fix(chat): running workflows expanded behavior stabilization
- `3c7df3c` fix(chat): active dropdown stability + truncation improvements
- `9ce8d56` refactor(chat): restore workflow thinking + minimal running treatment
- `fe5f925` fix(chat): keep pre-tool thinking inside workflow + sync animation state
- `bfabdfa` refine(chat): manual collapse persistence + inline Pi affordance
- `4553916` refine(chat): code-block polish + interleaved timeline behavior
- `f36e29f` fix(chat): avoid empty assistant placeholder row generation
- `211db6f` fix(chat): dedupe repeated streamed thinking in workflow timeline

---

## Remaining follow-up before merge

- Open PR for `feat/chat-interface-issue-sweep` with issue mapping and validation notes.
- Complete #70 slash-action audit/cleanup and update status in issue + changelog.
- Final native smoke pass (streaming, parallel tools, long markdown/code, dark/light visual checks).
