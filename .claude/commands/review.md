---
name: review
description: Comprehensive code review following project standards
---

# Code Review

Perform a comprehensive code review of recent changes:

## 1. Code Quality Check

- Verify code follows style guidelines in CLAUDE.md
- Check for meaningful variable/function names
- Ensure functions are small and focused
- Review code comments for clarity

## 2. Test Coverage (TDD Compliance)

- **Critical**: Verify tests were written BEFORE implementation
- Check that all new features have corresponding tests
- Ensure test coverage meets project requirements (>80%)
- Validate tests are meaningful, not just for coverage

## 3. Error Handling

- Check all error cases are handled appropriately
- Verify error messages are clear and actionable
- Ensure no silent failures

## 4. Security Review

- Check for common vulnerabilities (injection, XSS, etc.)
- Verify input validation
- Review authentication/authorization logic
- Check for exposed secrets or credentials

## 5. Performance Considerations

- Identify potential bottlenecks
- Check for unnecessary computations
- Review database queries for efficiency
- Validate resource cleanup (connections, files, etc.)

## 6. Documentation

- Verify CLAUDE.md is updated if patterns changed
- Check that complex logic has explanatory comments
- Ensure public APIs are documented
- Update README if user-facing changes exist

## 7. Pre-commit Compliance

- Run pre-commit hooks on all changed files
- Fix any formatting, linting, or validation issues
- Verify no secrets detected

## Output Format

Provide feedback in this structure:

- **✅ Passed**: Areas that meet standards
- **⚠️ Warnings**: Non-critical improvements
- **❌ Issues**: Must-fix problems before merge

Be specific with file paths and line numbers.
