# Claude Code Project Template

A GitHub template repository that provides a standardized, fully-configured foundation for new projects developed with Claude Code. Includes built-in support for Test-Driven Development (TDD), automated code quality checks, and AI-assisted workflows.

## 🚀 Quick Start

### 1. Create Your Project

Click the **"Use this template"** button above to create a new repository from this template.

### 2. Clone and Setup

```bash
# Clone your new repository
git clone https://github.com/your-username/your-new-project.git
cd your-new-project

# Open Claude Code
claude
```

### 3. Run the Setup Wizard

In Claude Code, run:

```text
/setup-repo
```

The interactive wizard will:

- ✅ Gather your project information (name, tech stack, commands)
- ✅ Customize configuration files for your specific project
- ✅ Configure pre-commit hooks for your language
- ✅ Set up automated GitHub PR reviews
- ✅ Install and verify all configurations

### 4. Start Building

```bash
# Commit the configured files
git add .
git commit -m "chore: configure Claude Code for project"

# Start developing with TDD!
```

## 📦 What's Included

### Core Configuration

- **`CLAUDE.md`** - Project context for Claude Code with TDD guidelines
- **`docs/setup.md`** - Comprehensive setup checklist and best practices
- **`.pre-commit-config.yaml`** - Code quality hooks (formatting, linting, security)
- **`.github/claude-code-review.yml`** - Automated PR review configuration

### Custom Slash Commands

Located in `.claude/commands/`:

- **`/setup-repo`** - Interactive setup wizard (run this first!)
- **`/review`** - Comprehensive code review (quality, tests, security, performance)
- **`/tdd-check`** - Verify TDD workflow compliance
- **`/precommit`** - Run pre-commit hooks on all files

## 🎯 Key Features

### Test-Driven Development (TDD)

This template enforces TDD workflow:

1. **Red** - Write a failing test first
2. **Green** - Write minimal code to make it pass
3. **Refactor** - Improve code while keeping tests green

Use `/tdd-check` to verify you're following TDD principles.

### Automated Code Quality

- Pre-commit hooks for consistent formatting and linting
- Secret detection to prevent credential leaks
- Language-specific quality checks (Python, Go, JavaScript/TypeScript)
- Automated PR reviews with Claude Code

### Claude Code Optimized

- Project-specific context in CLAUDE.md
- Custom slash commands for common workflows
- Automated PR reviews configured out of the box
- Best practices built into the template

## 🛠️ Supported Languages

The template is language-agnostic but includes pre-configured hooks for:

- **Python** - Black, Flake8, isort
- **Go** - gofmt, go vet, go imports
- **JavaScript/TypeScript** - Prettier, ESLint
- **Generic** - File formatting, YAML/JSON validation, secret detection

Simply uncomment the relevant hooks in `.pre-commit-config.yaml` during setup.

## 📚 Documentation

- **`CLAUDE.md`** - Main project context for Claude Code
- **`docs/setup.md`** - Detailed setup instructions and best practices
- **`.claude/commands/`** - Custom command documentation

## 🔧 Manual Setup (Alternative)

If you prefer not to use the interactive wizard, follow the manual checklist in `docs/setup.md`.

## 🤝 Contributing to the Template

To improve this template:

1. Make your changes
2. Test with a new project
3. Update documentation
4. Submit a PR

## 📝 License

[Add your license here]

## 🙋 Support

For issues with:

- **This template**: Open an issue in this repository
- **Claude Code**: Visit <https://docs.claude.com/en/docs/claude-code>
- **Feedback**: <https://github.com/anthropics/claude-code/issues>

---

**Template Version:** 1.0
**Last Updated:** 2025-10-02

Built with ❤️ for Claude Code development
