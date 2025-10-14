# Project: GitHub Template for Claude Code Projects

## Repository Purpose

This is a **GitHub template repository** designed to provide a standardized foundation for new projects that will be developed with Claude Code. It includes setup documentation and best practices for TDD-driven development with AI assistance.

## Using This Template

### For New Projects

1. Click "Use this template" on GitHub to create a new repository
2. Clone your new repository locally
3. Open Claude Code in the project directory: `claude`
4. **Run `/setup-repo`** - Interactive wizard that will:
   - Gather your project information (name, tech stack, commands)
   - Customize CLAUDE.md with your project details
   - Configure pre-commit hooks for your language
   - Set up GitHub PR review automation
   - Install and verify all configurations
5. Commit the configured files and start building with TDD!

Alternatively, you can manually follow the setup checklist in `docs/setup.md`.

### Template Contents

- `README.md` - Template overview and quick start guide
- `docs/setup.md` - Comprehensive Claude Code setup checklist
- `CLAUDE.md` - This file (customize for your project)
- `.claude/commands/` - Custom slash commands for workflows
  - `setup-repo.md` - **Interactive setup wizard (start here!)**
  - `review.md` - Comprehensive code review workflow
  - `tdd-check.md` - TDD compliance verification
  - `precommit.md` - Pre-commit hooks runner
- `.github/claude-code-review.yml` - Automated PR review configuration
- `.pre-commit-config.yaml` - Code quality hooks configuration

## Development Philosophy

### Test-Driven Development (TDD)

All projects created from this template should follow TDD:

1. **Red**: Write a failing test first
2. **Green**: Write minimal code to make it pass
3. **Refactor**: Improve code while keeping tests green

### Claude Code Best Practices

- Use 3-step process: Research → Plan → Implement
- Write tests before implementation
- Commit frequently with clear messages
- Use @-mentions to include relevant files in context
- Leverage custom slash commands for common workflows

### Custom Slash Commands

This template includes custom slash commands in `.claude/commands/`:

- **`/setup-repo`** - Interactive setup wizard for new projects (run this first!)
- **`/review`** - Comprehensive code review covering quality, tests, security, performance, and documentation
- **`/tdd-check`** - Verify TDD workflow compliance (tests written before implementation)
- **`/precommit`** - Run pre-commit hooks on all files to catch quality issues

Customize these commands or add new ones for your project-specific workflows.

## Customization Checklist

When creating a new project from this template:

- [ ] Update this CLAUDE.md with project-specific information
- [ ] Add Quick Commands section with your build/test/lint commands
- [ ] Define Code Style Guidelines for your language/framework
- [ ] Document Project Structure
- [ ] Set up Testing Requirements and framework
- [ ] Configure Git Workflow and branching strategy
- [ ] Add Environment Setup instructions
- [ ] Document Common Patterns specific to your project
- [ ] List Known Issues/Gotchas
- [ ] Add Dependencies Notes
- [ ] Customize `.pre-commit-config.yaml` for your language (uncomment relevant hooks)
- [ ] Update `.github/claude-code-review.yml` with project-specific review criteria
- [ ] Modify or add custom slash commands in `.claude/commands/` as needed
- [ ] Install and configure pre-commit: `pip install pre-commit && pre-commit install`
- [ ] Set up GitHub App for PR reviews: run `/install-github-app` in Claude Code

## Quick Commands (Template Defaults)

Replace this section with your actual commands:

```bash
# Build: [Add your build command]
# Test: [Add your test command]
# Lint: [Add your lint command]
# Type Check: [Add your typecheck command]
# Dev Server: [Add your dev command]
```

## Code Style Guidelines (Customize)

- Follow TDD: Write tests first, then implementation
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- [Add language-specific conventions]

## Testing Requirements

- **TDD is mandatory**: All features must start with tests
- Write unit tests for all business logic
- Add integration tests for critical paths
- Maintain >80% code coverage
- Run tests before every commit

## Git Workflow

- Branch naming: `feature/*`, `bugfix/*`, `hotfix/*`
- Commit message format: `type: description`
  - Types: feat, fix, docs, style, refactor, test, chore
- Always create PR for review
- Rebase before merging

## Pre-commit Hooks

This template includes `.pre-commit-config.yaml` with generic code quality hooks:

- File formatting (trailing whitespace, end-of-file, line endings)
- Syntax validation (YAML, JSON, TOML, XML)
- Secret detection (gitleaks)
- Large file detection
- Merge conflict detection

**Setup:**

```bash
pip install pre-commit
pre-commit install
```

**Run manually:**

```bash
pre-commit run --all-files
```

Customize `.pre-commit-config.yaml` for your language-specific needs (Python, Go, JavaScript, etc.).

## GitHub Integration

This template includes `.github/claude-code-review.yml` for automated PR reviews.

**Setup:**

1. Run `/install-github-app` in Claude Code session
2. Customize review criteria in `.github/claude-code-review.yml`
3. Claude will automatically review PRs based on configured rules

The default configuration checks for:

- Code quality and style compliance
- TDD compliance (tests written first)
- Bugs and edge cases
- Security vulnerabilities
- Performance issues
- Documentation updates

## Notes for Template Maintainers

- Keep `docs/setup.md` updated with latest Claude Code best practices
- This template should remain language-agnostic
- Focus on Claude Code integration patterns
- Update checklist based on user feedback

---

**Template Version:** 1.0
**Last Updated:** 2025-10-02
**Maintained By:** [Your Name/Team]
