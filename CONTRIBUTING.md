# Contributing

Thank you for considering contributing to this project! This document outlines the process and guidelines for contributing.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report:

- Check the existing issues to avoid duplicates
- Collect relevant information (OS, version, steps to reproduce)

When creating a bug report, use the bug report template and include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Any relevant logs or screenshots

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use the feature request template
- Provide a clear description of the problem and proposed solution
- Explain why this enhancement would be useful
- Include examples if applicable

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow TDD workflow**: Write tests before implementation
3. **Make your changes**:
   - Follow the project's code style
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass
4. **Run pre-commit hooks**: `pre-commit run --all-files`
5. **Commit your changes** using conventional commit format:
   - `feat: add new feature`
   - `fix: resolve bug in component`
   - `docs: update README`
   - `test: add tests for feature`
   - `refactor: improve code structure`
6. **Push to your fork** and submit a pull request
7. **Fill out the PR template** completely
8. **Wait for review** and address any feedback

## Development Setup

### Prerequisites

```bash
# List prerequisites here
# Example:
# - Node.js 18+
# - Python 3.9+
# - Go 1.21+
```

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
cd REPO_NAME

# Install dependencies
# Add your installation commands here

# Install pre-commit hooks
pip install pre-commit
pre-commit install
```

### Running Tests

```bash
# Add your test commands here
# Examples:
# npm test
# go test ./...
# pytest
```

### Running Locally

```bash
# Add your local development commands here
# Examples:
# npm run dev
# go run main.go
# python app.py
```

## Testing Requirements

- **TDD is mandatory**: Write tests before implementation
- All new features must include tests
- All tests must pass before submitting PR
- Aim for >80% code coverage
- Include both unit and integration tests where appropriate

## Code Style Guidelines

- Follow the existing code style in the project
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Run linters before committing

## Git Commit Messages

- Use conventional commit format: `type: description`
- Keep the first line under 72 characters
- Use present tense ("add feature" not "added feature")
- Reference issues and PRs where applicable

## Review Process

1. A maintainer will review your PR
2. Changes may be requested
3. Once approved, your PR will be merged
4. Your contribution will be included in the next release

## Questions?

- Open a discussion in GitHub Discussions
- Check existing documentation
- Review closed issues for similar questions

## Recognition

Contributors are recognized in the project. Thank you for your contributions!
