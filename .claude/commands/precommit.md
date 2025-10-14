---
name: precommit
description: Run pre-commit hooks on all files to ensure code quality
---

# Pre-commit Checks

Run pre-commit hooks on all files to catch issues before committing.

## Steps

1. **Install pre-commit (if not already installed)**

   ```bash
   # Python-based projects
   pip install pre-commit

   # Or using homebrew
   brew install pre-commit
   ```

2. **Install hooks**

   ```bash
   pre-commit install
   ```

3. **Run on all files**

   ```bash
   pre-commit run --all-files
   ```

4. **Review and fix issues**
   - Formatting issues (usually auto-fixed)
   - Linting errors (requires manual fixes)
   - Security issues (secrets detected)
   - File issues (trailing whitespace, EOF, etc.)

5. **Re-run after fixes**

   ```bash
   pre-commit run --all-files
   ```

## Common Hooks Checked

- **Trailing whitespace** - Removes trailing spaces
- **End-of-file fixer** - Ensures files end with newline
- **YAML/JSON/TOML validation** - Syntax checking
- **Mixed line endings** - Normalizes to LF
- **Secret detection** - Prevents committing credentials
- **Code formatters** - Prettier, Black, gofmt, etc.
- **Linters** - ESLint, Pylint, golangci-lint, etc.

## Troubleshooting

If hooks fail:

- Read error messages carefully
- Fix issues manually if auto-fix doesn't work
- Check `.pre-commit-config.yaml` for configuration
- Update hooks: `pre-commit autoupdate`

## Note

Some hooks may modify files automatically. Review changes with `git diff` before committing.
