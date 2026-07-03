# AI Collaboration

This repository may be worked on by multiple AI agents and human developers. Coordination is mandatory.

## Participants

### ChatGPT

Useful for product thinking, architecture, documentation, and prompt refinement.

### Codex

Useful for repository-aware implementation, shell validation, code edits, build checks, and handoff updates.

### Claude

Useful for large-document reasoning, planning, and implementation review when connected to the project.

### GitHub Copilot

Useful for inline coding assistance, autocomplete, and local developer acceleration.

### Future Developers

Human developers own final judgment, production approval, credentials, deployment decisions, and business priorities.

## Responsibilities

Every agent must:

- Read `OPERATOR_HANDOFF.md`.
- Read core architecture docs.
- Check git status.
- Understand existing work.
- Avoid overwriting another contributor.
- Keep changes focused.
- Run `npm run build`.
- Update handoff after work.

## Conflict Resolution

When instructions conflict:

1. Follow the newest explicit user instruction.
2. Preserve security and tenant isolation.
3. Preserve working application behavior.
4. Do not overwrite another agent's work without approval.
5. Ask for clarification if the conflict cannot be resolved safely.

## Handoff Process

After each session, update `OPERATOR_HANDOFF.md` with:

- Date/time
- Agent/tool used
- Objective
- Files changed
- Summary of work completed
- Build result
- Known issues
- Next recommended step

## Documentation Updates

Update documentation when:

- Architecture changes
- Schema changes
- Routes change
- Auth behavior changes
- Module behavior changes
- Workflow rules change
- A durable decision is made

## Session Workflow

Recommended session flow:

1. Read required docs.
2. Check status.
3. Identify owned files.
4. Make focused changes.
5. Run validation.
6. Update docs and handoff.
7. Provide clear summary and commit commands.

## Avoiding Agent Collisions

- Do not stage all files blindly.
- Do not run destructive git commands without explicit permission.
- Do not remove untracked files unless instructed.
- Do not assume dirty files are yours.
- Prefer explicit file lists in git commands.

## Good Final Handoff

A good final response includes:

- What changed
- What validation ran
- What remains known or planned
- Suggested commit message
- Exact git commands
