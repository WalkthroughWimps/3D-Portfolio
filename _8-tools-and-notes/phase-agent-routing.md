# Architecture phase agent routing

Use this routing when the user asks to continue the unfinished phases in `videos-intro-repair-handoff.md`. This is a reusable coordinator recipe for Codex multi-agent turns; it does not start work by itself.

## Coordinator

The root agent remains the coordinator. It reads the handoff and repository instructions, identifies the next dependency-ready phase, gives one subagent a bounded phase task, waits for its result, reviews the changes and evidence, then updates the handoff. Keep the phase work in order because later acceptance depends on earlier ownership, media, and storage decisions. Delegate independent read-only audits in parallel only when they do not depend on another phase or touch the same files.

For each subagent, set the model and reasoning effort explicitly in the native `spawn_agent` call. Do not assume subagents inherit the coordinator's model. Choose per bounded assignment, not per whole phase. Use the least expensive model and effort that can complete it reliably. If the coordinator cannot confidently identify that model, do not guess: send one compact, batched model-selection request to the next stronger available model, with the task scope, constraints, acceptance checks, and cost priority. Ask it to name the lowest sufficient model/effort and explain the capability boundary. Repeat up the model ladder only if that answer is still uncertain. If even the strongest available model cannot make a reliable call, ask the user to narrow or clarify the assignment before creating agents.

## Phase routing

| Work | Start with | Reasoning | Escalate when |
| --- | --- | --- | --- |
| Phase 1 evidence / Phase 2 live-worker and media closure | `gpt-6-luna` or `gpt-5.6-luna` | `low` | For a small repair use `gpt-5.6-terra` or `gpt-6-sol` at `low`; move to `gpt-6.1-sol` only for nontrivial diagnosis. Phase 2 and 3 original gates are complete; do not reopen without a concrete failing gate. |
| Phase 4 acceptance closure | `gpt-6-sol` | `low` | Use `gpt-6.1-sol` at `low`/`medium` if the bounded decision exceeds the older Sol model; Astra only for an unresolved high-impact blocker. |
| Phase 5 Start, Videos, and Games | `gpt-5.6-terra` or `gpt-6-sol` | `low` | Use Luna for inventory, evidence, and docs; use `gpt-6.1-sol` if a concrete code or integration issue defeats the initial assignment. |
| Phase 6 Music | `gpt-6-sol` | `medium` | Use `gpt-6.1-sol` if the coupled audio/memory/ownership slice needs stronger reasoning; Astra only for a difficult blocker after a focused attempt. |
| Phase 7 presentation and performance | `gpt-6-luna` or `gpt-5.6-terra` | `low` | Use `gpt-6-sol` at `low`/`medium` for scene-wide implementation or performance tradeoffs. Run after Phase 6 evidence it depends on. |
| Phase 8 release acceptance | `gpt-5.6-terra` or `gpt-6-sol` | `low` | Use `gpt-6.1-sol` for a complex integration gate; Astra only for a release blocker whose resolution requires it. Start only after prerequisite owner fixes and release inputs are ready. |

Treat this table as a starting point, not a requirement to use an agent for every phase. The root may handle a bounded task itself. When delegation helps, send only the required context and give one agent one bounded assignment at a time. Do not run dependent implementation phases in parallel. Limit active subagents to one by default; use a second only for independent read-only work. Prefer available GPT-6 or GPT-5.6 models when they meet the acceptance bar. `gpt-5.6-sol` is available for tasks that need its particular strengths, but do not select it solely because it is flagship; prefer Luna/Terra or GPT-6 Sol when sufficient. Astra is the final escalation tier, not the default. Avoid high/xhigh effort unless the user asks or a lower setting demonstrably fails.

Higher-tier models may be used for brief guidance or review when that can prevent expensive rework. Bundle all related open questions and the minimum necessary context into one focused request. If the applicable usage meter charges per question/message/task, combine questions into one call rather than making separate higher-tier calls. Keep implementation on the lower-cost capable model unless the higher-tier model needs to own a specific difficult slice.

## Credit-minimizing workflow

- Have the coordinator inspect the handoff and repository status once. Avoid having every subagent reread the whole project packet; give each only the relevant numbered steps, acceptance gates, and narrow file excerpts/paths.
- Prefer one subagent per bounded assignment. Do not make review, test, or implementation agents duplicate each other's work. Reuse recorded results and rerun a check only when source changes or the existing evidence does not cover the acceptance gate.
- Search narrowly before opening files; inspect only likely owners and call sites. Avoid broad repository summaries, repeated full-file dumps, and long copied tool output.
- Do not add/run tests unless the user asks. If asked to verify, run the smallest existing check that covers the change, then broaden only when it finds a problem or the acceptance gate requires broader coverage.
- Keep agent prompts and status updates short. Ask the agent to return changed paths, validation evidence, blockers, and remaining steps, not a second full project recap.
- Use one higher-model guidance call with bundled questions when useful; do not promote every agent or send the whole repository to the guidance model. If the advice is enough, let the lower-cost implementation agent continue.
- Do not run dependent work in parallel or use a second agent for marginal speed gains. Shared checkout contention and duplicate context can cost more than sequential work.

## Usage preflight

Before starting a broad phase, a multi-agent run, or work likely to use substantially more than one ordinary focused task, send a short estimate first. Include the proposed model/effort mix, number of agent assignments, scope assumptions, and low / likely / high usage range. Mention that retries, large context, long outputs, and parallel agents can move actual usage outside the estimate. If the likely estimate exceeds about **50 credits**, or has a wide range because the phase is poorly bounded, pause for the user's go-ahead before starting. For a smaller but still material estimate, notify the user before starting and proceed with the requested work.

Use current official Codex Work/Codex usage guidance and the account's applicable rate card when expressing credits; do not invent a fixed per-task price. The published guidance says GPT-6.1 Sol tasks often fall around 2–15 credits on its applicable credit plan, while actual usage depends on model, input/output, context, reasoning, and task; plan-included usage may show as allowance consumption rather than a cash-like credit charge. Treat that figure only as a rough anchor, not a promise or a price estimate for an entire phase. If the account's billing mode is unknown, say so and give a relative allowance estimate (low / moderate / high) alongside the assumptions. Do not use Fast mode by default.

## Assignment contract

Give each phase agent:

1. The exact phase and numbered steps it owns from the handoff.
2. The relevant existing acceptance gates, source files, and evidence paths.
3. The repository's current dirty-worktree warning: preserve inherited edits, do not reset or clean, and do not claim inherited changes as its work.
4. A request to implement only that bounded assignment, run verification only when requested, report changed paths and evidence, identify every unfinished step, and leave the handoff ready for coordinator review.

The coordinator reviews the diff and any requested validation evidence, resolves cross-agent integration, refreshes the handoff's remaining-step list, and reports inherited failures separately from new failures. Do not add or run tests unless the user asks; if validation is requested, use the existing required checks and report any unavailable coverage.

Do not create background automations or external API agents from this routing file. A user request starts each coordinator run, and the user must explicitly authorize any commit, push, publication, or deployment.
