# Repository Guidelines

## Project Structure & Module Organization

- Root configuration files (`CLAUDE.md`, `.pre-commit-config.yaml`, `.editorconfig`, `.github/claude-code-review.yml`) drive the Claude Code workflows and quality checks; review them before changing automation defaults.
- Documentation lives in `docs/` (setup guides, progress logs). Extend this folder for additional checklists or architecture notes and reference new material from `CLAUDE.md`.
- AI command definitions reside in `.claude/commands/`; when adding workflows, document purpose, inputs, and expected outputs in each Markdown file.
- The template intentionally ships without `src/` or runtime assets. If you add exemplar code, mirror the layout you expect downstream projects to follow and document that structure.

## Build, Test, and Development Commands

- Launch the Claude Code assistant in this workspace: `claude` (requires `npm install -g @anthropic-ai/claude-code`).
- Run the interactive configuration wizard via `/setup-repo` inside Claude; inspect generated diffs before committing.
- Enforce repository quality gates locally: `pip install pre-commit && pre-commit run --all-files`.
- Match CI markdown linting: `npx markdownlint-cli2 '**/*.md'`.

## Coding Style & Naming Conventions

- `.editorconfig` enforces LF endings, UTF-8 encoding, and spaces (4 for Python snippets, 2 for JavaScript). Match these defaults in examples and scaffolding.
- Keep prose succinct, favouring ordered checklists when outlining tasks or workflows.
- Name new branches `type/short-context` and mirror that prefix in any sample folders you add.
- Place reusable prompts in `.claude/commands/<name>.md`; prefix filenames with action verbs (`review`, `tdd-check`) to align with existing commands.

## Testing Guidelines

- Template messaging promises >80% coverage and strict TDD. Ensure guidance, sample code, and automation honour this requirement.
- When adding reference implementations, include the failing test first (place in `tests/` or equivalent) and document how to run it.
- Update `docs/setup.md` whenever you introduce new testing frameworks, coverage tooling, or workflow expectations.

## Commit & Pull Request Guidelines

- Prefer Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Keep subject lines under 72 characters and provide rationale in the body when behaviour shifts.
- Link GitHub issues in PR descriptions and list updated docs or commands under a short checklist.
- Include screenshots or terminal snippets when documentation or command UX changes.
- Before requesting human review, run `/review` and `/precommit` inside Claude to surface automated feedback.

## Agent Workflow Notes

- Treat `CLAUDE.md` as the authoritative context file; cross-link new docs and keep quick-command tables current.
- Highlight permission expectations or sandbox requirements in both `docs/setup.md` and this guide whenever they change.
