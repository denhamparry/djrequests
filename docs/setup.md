# Setup - Claude Code Project Setup Checklist

## 🚀 Initial Setup

### Prerequisites

- [ ] Node.js installed on your system
- [ ] Git repository initialized for your project
- [ ] VS Code, Cursor, or compatible IDE installed

### Installation & Authentication

- [ ] Install Claude Code globally: `npm install -g @anthropic-ai/claude-code`
- [ ] Install IDE extension (VS Code/Cursor) for easy launching
- [ ] Navigate to project directory: `cd your-project`
- [ ] Run initial setup: `claude`
- [ ] Choose authentication method:
  - [ ] Claude account connection (recommended: start with \$20/month plan)
  - [ ] OR API key (monitor usage costs carefully)

### Terminal Configuration

- [ ] Configure terminal for better interaction: run `/terminal-setup` in Claude
- [ ] Consider permission settings (choose one):
  - [ ] Standard mode (will ask for permissions)
  - [ ] Skip permissions mode: `claude --dangerously-skip-permissions` (evaluate
        risk)

## 📁 Project Configuration

### Create CLAUDE.md File

- [ ] Create `CLAUDE.md` in project root
- [ ] Add the following sections to CLAUDE.md:

```markdown
# Project: [Your Project Name]

## Quick Commands

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Type Check: `npm run typecheck`
- Dev Server: `npm run dev`

## Code Style Guidelines

- [ Add your specific style rules ]
- Use ES modules (import/export), not CommonJS
- Follow [TypeScript/JavaScript/Python] conventions
- Prefer functional components over class components (React)
- Use meaningful variable names
- Add comments for complex logic

## Project Structure

- /src - Source code
- /tests - Test files
- /docs - Documentation
- [ Add your structure ]

## Testing Requirements

- Write tests for all new features
- Maintain >80% code coverage
- Run tests before committing
- Use TDD when possible

## Git Workflow

- Branch naming: feature/_, bugfix/_, hotfix/\*
- Commit message format: "type: description"
- Always create PR for review
- Rebase before merging

## Environment Setup

- Node version: [specify]
- Required environment variables: [list them]
- Database setup: [if applicable]

## Common Patterns

[ Document patterns specific to your project ]

## Known Issues / Gotchas

[ List any project-specific quirks ]

## Dependencies Notes

[ Any special setup for dependencies ]
```

### Testing Infrastructure

- [ ] Set up test framework (Jest, Pytest, etc.)
- [ ] Configure test scripts in package.json/project config
- [ ] Create initial test file structure
- [ ] Set up code coverage reporting

### Code Quality Tools

- [ ] Install and configure linter (ESLint, Pylint, etc.)
- [ ] Set up code formatter (Prettier, Black, etc.)
- [ ] Configure type checking (TypeScript, mypy, etc.)
- [ ] Install pre-commit hooks: `pip install pre-commit` or `npm install husky`
- [ ] Create `.pre-commit-config.yaml` or husky configuration

## 🎯 Workflow Setup

### Planning Documents

- [ ] Create `docs/` directory for project documentation
- [ ] Consider creating:
  - [ ] `spec.md` - Project specifications
  - [ ] `prompt_plan.md` - Planned Claude Code prompts
  - [ ] `architecture.md` - System architecture

### Custom Commands (Optional)

- [ ] Create `.claude/commands/` directory
- [ ] Add custom workflow commands (example: review.md):

```markdown
---
name: review
description: Comprehensive code review
---

Perform a code review:

1. Check code follows our style guide in CLAUDE.md
2. Verify error handling
3. Check test coverage
4. Review security implications
5. Validate performance
6. Update documentation
```

### GitHub Integration

- [ ] Run `/install-github-app` in Claude Code for PR reviews
- [ ] Create `.github/claude-code-review.yml`:

```yaml
direct_prompt: |
  Review this PR for bugs and security issues.
  Be concise. Focus on actual problems.
```

## 🔧 Advanced Configuration (Optional)

### MCP Servers

- [ ] Identify needed integrations (Jira, Slack, databases)
- [ ] Install relevant MCP servers
- [ ] Configure authentication for each service
- [ ] Test connections

### Hooks Setup

- [ ] Create hooks configuration file
- [ ] Define PreToolUse hooks (validation)
- [ ] Define PostToolUse hooks (cleanup)

### CI/CD Integration

- [ ] Add Claude Code to CI pipeline for automated reviews
- [ ] Set up automated testing on commits
- [ ] Configure deployment automation

## 💡 Best Practices Checklist

### Before Starting Work

- [ ] Clear previous context: `/clear`
- [ ] Pull latest changes from repository
- [ ] Review CLAUDE.md for updates
- [ ] Check for any new project requirements

### During Development

- [ ] Use the 3-step process: Research → Plan → Implement
- [ ] Write tests first (TDD approach)
- [ ] Commit frequently with clear messages
- [ ] Use @-tagging to include specific files in context
- [ ] Run linter and tests before committing

### Model Selection

- [ ] Start with Opus 4.1 for complex tasks
- [ ] Switch to Sonnet 4 if hitting limits
- [ ] Use `--enable-architect` for large refactoring

### Cost Management

- [ ] Monitor usage if on API billing
- [ ] Clear chat history regularly to save tokens
- [ ] Be specific in prompts to avoid iterations
- [ ] Use headless mode for simple tasks: `claude -p "prompt"`

## 🚦 Quick Reference

### Essential Commands

```bash
# Start Claude Code
claude

# Headless mode
claude -p "your prompt here"

# Skip permissions
claude --dangerously-skip-permissions

# Large refactoring
claude --enable-architect

# Pipe data
cat data.csv | claude -p "analyze this"
```

### Slash Commands in Claude

```text
/clear          - Clear conversation context
/terminal-setup - Configure terminal
/install-github-app - Set up GitHub integration
/review         - Run code review (if configured)
```

### Tips for Prompting

- Be specific and detailed
- Break complex tasks into steps
- Ask Claude to verify changes
- Request specific output formats
- Update CLAUDE.md when you find new patterns

## 📊 Project Health Checks

### Daily

- [ ] Review Claude's commits for accuracy
- [ ] Update CLAUDE.md with new patterns discovered
- [ ] Check test coverage metrics

### Weekly

- [ ] Review API usage/costs
- [ ] Update documentation
- [ ] Refactor based on Claude's suggestions
- [ ] Clean up unused code

### Per Feature

- [ ] Document feature in CLAUDE.md
- [ ] Create comprehensive tests
- [ ] Update relevant documentation
- [ ] Get code review (human + Claude)

## 🎓 Learning Resources

- [ ] Review Anthropic's official docs:
      <https://docs.claude.com/en/docs/claude-code>
- [ ] Check Claude Code best practices:
      <https://www.anthropic.com/engineering/claude-code-best-practices>
- [ ] Join community discussions for tips
- [ ] Experiment with different workflows

## 🔒 Safety Reminders

- [ ] Never give Claude access to production credentials
- [ ] Review all changes before deploying
- [ ] Keep backups of critical code
- [ ] Start with read-only commands when learning
- [ ] Use branches for experimental changes
- [ ] Don't auto-commit without review

## 📝 Notes Section

### Project-Specific Notes

Add your own notes here as you learn what works best for your project

### Lessons Learned

Document what works and what doesn't for future reference

### Custom Workflows

Record any special workflows you develop

---

**Remember:** Think of Claude Code as "a very fast intern with great memory but
limited experience". Guide it well, and it will significantly boost your
productivity!

**Created:** [Date] **Last Updated:** [Date] **Project:** [Your Project Name]
