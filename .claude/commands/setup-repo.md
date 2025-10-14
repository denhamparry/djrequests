---
name: setup-repo
description: Interactive setup wizard for new projects created from this template
---

# Repository Setup Wizard

Welcome! This wizard will help you configure Claude Code optimally for your new project.

## Step 1: Gather Project Information

Ask the user the following questions and collect their responses:

### Basic Information

1. **Project name**: What is the name of this project?
2. **Project description**: Briefly describe what this project does (1-2 sentences)
3. **Primary language/framework**: What is the main technology? (e.g., Python, Node.js/TypeScript, Go, React, Next.js, etc.)
4. **Project type**: What type of project is this? (web app, CLI tool, library, API, microservice, etc.)

### Commands

5. **Build command**: How do you build this project? (e.g., `npm run build`, `go build`, `make`, etc.)
6. **Test command**: How do you run tests? (e.g., `npm test`, `pytest`, `go test ./...`, etc.)
7. **Lint command**: How do you lint code? (e.g., `npm run lint`, `pylint`, `golangci-lint run`, etc.)
8. **Type check command** (if applicable): How do you type check? (e.g., `tsc --noEmit`, `mypy .`, etc.)
9. **Dev server command** (if applicable): How do you start the dev server? (e.g., `npm run dev`, `python manage.py runserver`, etc.)

### Code Style Preferences

10. **Code style guide**: Any specific style guide to follow? (e.g., Airbnb, Google, PEP 8, Standard, etc.)
11. **Additional conventions**: Any project-specific conventions or patterns to follow?

### Project Structure

12. **Source directory**: Where is the main source code? (e.g., `src/`, `lib/`, `app/`, etc.)
13. **Test directory**: Where are tests located? (e.g., `tests/`, `__tests__/`, `test/`, etc.)
14. **Documentation directory**: Where is documentation? (e.g., `docs/`, `documentation/`, etc.)

### Environment & Dependencies

15. **Runtime version**: What version of the runtime? (e.g., Node 20.x, Python 3.11, Go 1.21, etc.)
16. **Package manager**: What package manager? (e.g., npm, yarn, pnpm, pip, poetry, go modules, etc.)
17. **Required env vars**: Any critical environment variables to document? (list them)

## Step 2: Update CLAUDE.md

Based on the collected information, update `/path/to/CLAUDE.md`:

1. Replace `[Your Project Name]` with the actual project name
2. Update the project description section
3. Fill in the Quick Commands section with the actual commands collected
4. Update Code Style Guidelines with specific language conventions and style guide
5. Document the Project Structure with actual directories
6. Fill in Environment Setup with runtime version, package manager, and env vars
7. Add any additional patterns or conventions mentioned
8. Update the "Last Updated" date to today's date
9. Add the user's name/team to "Maintained By" if they provide it

## Step 3: Customize Pre-commit Configuration

Based on the primary language/framework, update `.pre-commit-config.yaml`:

### For Python Projects

- Uncomment the Black, Flake8, and isort hooks
- Update Python version in `default_language_version`
- Add any Python-specific checks mentioned

### For Go Projects

- Uncomment the Go hooks (go-fmt, go-vet, go-imports, go-mod-tidy)
- Remove Python-specific sections

### For JavaScript/TypeScript/Node.js Projects

- Uncomment Prettier and ESLint hooks
- Update Node version in `default_language_version`
- Add necessary ESLint plugins to `additional_dependencies`

### For Multiple Languages

- Enable hooks for all relevant languages
- Adjust exclude patterns as needed

## Step 4: Update GitHub PR Review Configuration

Update `.github/claude-code-review.yml`:

1. Ask if there are specific file paths to include/exclude from reviews
2. Add any language-specific review criteria to `file_type_instructions`
3. Configure any skip conditions if needed (e.g., bot PRs, specific PR titles)

## Step 5: Install Pre-commit Hooks

Guide the user through installation:

```bash
# Install pre-commit
pip install pre-commit

# Install the git hooks
pre-commit install

# Test the configuration
pre-commit run --all-files
```

If the test run shows errors, help fix them before proceeding.

## Step 6: GitHub Integration Setup

Guide the user through GitHub integration:

1. Explain they need to run `/install-github-app` to set up automated PR reviews
2. Verify `.github/claude-code-review.yml` is configured correctly
3. Explain that Claude will now automatically review PRs based on the configuration

## Step 7: Custom Commands Review

Ask the user if they want to:

- Modify existing commands (`/review`, `/tdd-check`, `/precommit`)
- Add new project-specific commands
- Remove any commands they won't use

If they want changes, guide them through creating/modifying command files in `.claude/commands/`.

## Step 8: Verification & Next Steps

Run verification checks:

1. **CLAUDE.md**: Verify all placeholders are replaced with actual values
2. **Pre-commit**: Confirm hooks are installed and passing
3. **Commands**: List available custom slash commands
4. **Git status**: Show what files were modified

Provide a summary:

```markdown
## ✅ Setup Complete!

Your project is now configured for Claude Code development.

### What was configured:
- ✅ CLAUDE.md updated with project details
- ✅ Pre-commit hooks configured for [language]
- ✅ GitHub PR review automation configured
- ✅ Custom slash commands available: /review, /tdd-check, /precommit

### Next steps:
1. Review the changes to CLAUDE.md and adjust as needed
2. Commit the configuration: `git add . && git commit -m "chore: configure Claude Code for project"`
3. Run `/install-github-app` to enable automated PR reviews
4. Start developing with TDD: Write tests first, then implementation
5. Use `/tdd-check` before implementing features
6. Use `/review` before creating pull requests

### Available Commands:
- `/review` - Comprehensive code review
- `/tdd-check` - Verify TDD compliance
- `/precommit` - Run quality checks
- `/setup-repo` - Run this wizard again

### Tips:
- Use @CLAUDE.md in prompts to give context about your project
- Update CLAUDE.md as you discover new patterns
- Keep pre-commit hooks passing to maintain code quality
- Leverage custom commands for consistent workflows

Happy coding with Claude! 🚀
```

## Important Notes

- Be conversational and friendly throughout the wizard
- If the user is unsure about something, provide sensible defaults
- Validate responses (e.g., check if commands exist, directories are valid)
- After each major step, show what was changed
- Make it easy to re-run the wizard if needed
- Save all responses to use when updating files
- Don't skip steps - complete the full setup process
