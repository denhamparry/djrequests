---
name: tdd-check
description: Verify TDD workflow compliance before implementation
---

# TDD Workflow Check

Ensure proper Test-Driven Development workflow is being followed:

## Pre-Implementation Checklist

Before writing ANY implementation code, verify:

1. **Test File Exists**
   - Check that test file is created for the feature
   - Verify test file follows project naming conventions
   - Ensure test file is in correct location

2. **Test Cases Written**
   - At least one failing test exists for new functionality
   - Tests are specific and cover edge cases
   - Test names clearly describe what is being tested

3. **Run Tests - Confirm RED**
   - Execute test suite
   - Verify new tests FAIL with expected error messages
   - Confirm no false positives (tests passing when they shouldn't)

## Implementation Phase

After tests are written and failing:

1. **Minimal Implementation**
   - Write just enough code to make tests pass
   - Avoid over-engineering or premature optimization
   - Focus on making the test green

2. **Run Tests - Confirm GREEN**
   - Execute test suite again
   - Verify new tests now PASS
   - Ensure no existing tests broke

3. **Refactor**
   - Improve code quality while keeping tests green
   - Extract duplications
   - Improve naming and structure
   - Re-run tests after each refactor

## TDD Violation Detection

Check for common TDD violations:

- ❌ Implementation code without corresponding tests
- ❌ Tests written after implementation (test-after)
- ❌ Tests that never failed (always green)
- ❌ Implementation more complex than needed to pass tests

## Reminder

**Red → Green → Refactor**

If you haven't seen a failing test, you're not doing TDD!
