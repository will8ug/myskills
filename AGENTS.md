# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) are used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Comments

Prefer self-documenting code over comments. Only add comments for knowledge that cannot be expressed in the code itself.

- **Self-document first.** Use clear test names, descriptive assertion values, and meaningful function names. A switch statement or a plain assertion with a self-explanatory expected value is already its own documentation.
- **Never restate what the code says.** If a comment describes what the next line does, the code already says that — remove the comment.
- **Never reference change history.** Comments like `// After the refactor, ...` are git-history noise. The commit message already captures what changed. Explain the *current state*, not the transition.
- **Reserve comments for non-obvious knowledge only:** gotchas that look correct but aren't (e.g., an em-dash resembling a hyphen), design decisions not evident from the code (e.g., a custom encoding scheme), and contract invariants a maintainer might unknowingly violate (e.g., "assumes input is already validated").

## Testing pyramid

Prefer the fastest tier that can verify a behavior. Integration tests are for what only they can verify — write one only when no unit tier can.

- **Unit-testable behavior lives at unit tiers.** Pure logic, input handling, and state transitions get called directly and asserted on their return values or captured effects — no full-app boot or render, no real I/O, no artificial waits. Single-component rendering gets its own tier. When a function CAN be covered by one of these tiers, cover it there — do not spin up the full application to assert it.
- **Integration tests are reserved for what demands the full stack:** real fs/subprocess/network roundtrips, timer or async semantics that only surface at the application level, race coordination between concurrently running parts, and cross-module wiring invariants that no single unit tier pins.
- **Never drop a verifier without naming its replacement.** Before deleting or skipping an integration test, point at the unit or component test that covers the same observable behavior — every behavior a test once pinned stays verified at some tier. Lower-tier coverage counts; duplicating the full-application run does not.
