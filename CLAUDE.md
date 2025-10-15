# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

**DJ Song Request Website** - A web app that enables guests at events to search for songs via the iTunes Search API, submit requests through a Google Form proxy, and automatically surface submissions in a Google Doc queue for the DJ to manage.

## Quick Commands

```bash
# Development
npm run dev                # Start Vite dev server on http://localhost:5173

# Testing
npm run test:unit          # Run Vitest unit/integration tests with coverage
npm run test:watch         # Run tests in watch mode
npm run test:e2e           # Run Playwright end-to-end tests (auto-starts dev server)
npm run test:e2e:ui        # Run Playwright tests in UI mode

# Code Quality
npm run lint               # ESLint with flat config (covers all TS/TSX files)

# Build & Preview
npm run build              # Production build to dist/
npm run preview            # Preview production build locally
```

## Architecture Overview

This is a **TDD-developed, serverless application** with three main components:

### 1. Frontend (`src/`)
- **Framework**: React 18 + Vite + TypeScript
- **Key Files**:
  - `src/App.tsx` - Main UI with search and request modal
  - `src/hooks/useSongSearch.ts` - Custom hook for iTunes search with debouncing
  - `src/lib/googleForm.ts` - Client utility to submit requests via Netlify function
  - `src/test/msw-server.ts` - Mock Service Worker setup for testing

### 2. Netlify Functions (`netlify/functions/`)
Serverless edge functions that act as proxies to hide API keys and enable CORS:

- **`search.ts`** - Proxies iTunes Search API requests
  - Accepts `?term=...` query parameter
  - Returns normalized track data (id, title, artist, album, artwork, preview)
  - Handles rate limiting (iTunes limit: ~20 req/min)
  - Returns 503 on 429 from iTunes with user-friendly error

- **`request.ts`** - Submits song requests to Google Form
  - Accepts POST with `{ song, requester }` payload
  - Reads `GOOGLE_FORM_URL` or `VITE_GOOGLE_FORM_URL` from environment
  - Converts `/viewform` to `/formResponse` URL
  - Populates form fields using IDs from `shared/formFields.ts`
  - Submits POST to Google Form with `application/x-www-form-urlencoded`

### 3. Apps Script (`apps-script/`)
Google Apps Script that runs on form submission to update the DJ's Google Doc queue:

- **`index.ts`** - Entry point with `onFormSubmit()` trigger
  - Wire this to the Google Form "On form submit" trigger
  - Update `GOOGLE_DOC_ID` constant with your target Doc ID
- **`format.ts`** - Pure formatting logic for Doc entries (fully unit-tested)

### Shared Code (`shared/`)
- **`formFields.ts`** - Google Form entry IDs mapping
  - **IMPORTANT**: Update these IDs with values from your prefilled Form URL
  - Extract `entry.xxxxx` parameters from the Google Form prefill link

## Google Workspace Integration

The app uses Google Form as a submission endpoint to avoid managing a database:

1. **Frontend** → calls `/.netlify/functions/request` with song + requester data
2. **Netlify Function** → transforms to Google Form POST with prefilled fields
3. **Google Form** → saves to linked Google Sheet
4. **Apps Script Trigger** → on form submit, appends formatted entry to Google Doc
5. **DJ** → manages queue manually in the Google Doc

### Configuration Steps

1. Create Google Form with these fields (short answer type):
   - Visible: `Requester Name`, `Dedication`, `Contact`
   - Hidden/prefilled: `Track ID`, `Track Name`, `Artist Name`, `Album Name`, `Artwork URL`, `Preview URL`

2. Get prefilled URL:
   - Form → ⋮ menu → "Get pre-filled link"
   - Fill dummy values for all hidden fields
   - Copy generated URL with `entry.xxxxx` parameters
   - Extract entry IDs and update `shared/formFields.ts`

3. Link Form to Google Sheet (Responses tab)

4. Create/choose target Google Doc for queue, note its ID from URL (`/d/{ID}/edit`)

5. Set up Apps Script:
   - Form → ⋮ → Script editor
   - Copy contents of `apps-script/index.ts`
   - Update `GOOGLE_DOC_ID` constant
   - Add "On form submit" trigger (triggers → ⊕)

6. Add environment variables:
   - Local: create `.env.local` with `VITE_GOOGLE_FORM_URL=<your-prefill-url>`
   - Netlify: add `GOOGLE_FORM_URL` or `VITE_GOOGLE_FORM_URL` in dashboard

## Testing Strategy

This project was built following **TDD (Test-Driven Development)**:

### Unit Tests (Vitest)
- **Netlify Functions**: `netlify/functions/__tests__/*.test.ts`
  - Test request/response handling, error cases, URL transformations
- **React Hooks**: `src/__tests__/*.test.tsx`
  - Test search hook with MSW-mocked API responses
- **Apps Script**: `apps-script/__tests__/*.test.ts`
  - Test Doc formatting logic in isolation

### E2E Tests (Playwright)
- **Smoke Test**: `tests/e2e/request.spec.ts`
  - Full user journey: search → select → request modal
  - Runs against live dev server (Vite auto-started by Playwright config)

### Test Coverage
- Coverage configured in `vite.config.ts`
- Run `npm run test:unit` to generate coverage report in `coverage/`
- Target: >80% coverage for all non-trivial code

## Development Workflow

### TDD Cycle (Red-Green-Refactor)
1. **Red**: Write failing test first
2. **Green**: Write minimal code to pass
3. **Refactor**: Clean up while keeping tests green
4. Commit with conventional format: `feat:`, `fix:`, `test:`, `refactor:`

### Running Single Tests
```bash
# Run specific test file
npx vitest run src/__tests__/SearchView.test.tsx

# Run specific test suite
npx vitest run --grep "search function"

# Watch mode for specific file
npx vitest watch netlify/functions/__tests__/request.test.ts
```

### Debugging Netlify Functions Locally
```bash
# Install Netlify CLI globally if needed
npm install -g netlify-cli

# Run dev server with functions
netlify dev
# Frontend: http://localhost:8888
# Functions: http://localhost:8888/.netlify/functions/{name}
```

## Code Style & Patterns

- **TypeScript strict mode** enabled across all `tsconfig.*.json` files
- **Explicit types** for function parameters and return values
- **Error handling**: Always handle fetch errors and API failures gracefully
- **Null safety**: Use optional chaining (`?.`) and nullish coalescing (`??`)
- **Pure functions**: Isolate business logic (see `apps-script/format.ts`) for testability
- **MSW for mocking**: All external API calls mocked via MSW in tests (`src/test/msw-server.ts`)

## Known Issues & Gotchas

### iTunes Search API
- **Rate Limit**: ~20 requests/minute per IP (enforced with 429 status)
- **Preview URLs**: Some tracks lack `previewUrl` - handle null gracefully
- **Artwork**: Not all tracks have high-res artwork - fallback to placeholder if needed

### Google Form Integration
- **Entry IDs change** if you recreate the form - always get fresh IDs from prefill URL
- **Form field order matters** - Apps Script expects field labels to match exactly
- **URL format**: Must end in `/viewform` or `/prefill` for the request function to work

### Apps Script Deployment
- **Trigger not automatic** - Must manually add "On form submit" trigger after deployment
- **Doc ID is hardcoded** - Update `GOOGLE_DOC_ID` constant before deploying
- **No local testing** - Use Vitest to test `format.ts` logic separately; Apps Script runtime can only be tested by submitting forms

## Environment Variables

### Required
- `VITE_GOOGLE_FORM_URL` (local) or `GOOGLE_FORM_URL` (Netlify) - Prefilled Google Form base URL

### Optional
- None currently; iTunes Search API requires no authentication

## Deployment

### Netlify (Recommended)
1. Connect GitHub repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variable: `GOOGLE_FORM_URL=<your-form-url>`
5. Functions are auto-detected in `netlify/functions/`

### Verifying Deployment
- Test search: `https://your-site.netlify.app/.netlify/functions/search?term=Beatles`
- Expected: JSON array of tracks
- Test form submission via frontend UI (check Google Doc for entry)

## File Structure Notes

- **No `src/components/`** - All UI in `App.tsx` for simplicity (single-page app)
- **Shared types** - Interfaces duplicated in functions/frontend due to Netlify isolation
- **Test collocation** - Tests live in `__tests__/` subdirectories near source files
- **TypeScript configs** - Split into `tsconfig.base.json`, `tsconfig.app.json`, `tsconfig.node.json` for different contexts (Vite, Node, Apps Script)

## Common Development Tasks

### Adding a New Netlify Function
1. Create `netlify/functions/{name}.ts`
2. Export `handler: Handler` from `@netlify/functions`
3. Add tests in `netlify/functions/__tests__/{name}.test.ts`
4. Access at `/.netlify/functions/{name}` in dev/production

### Updating Google Form Fields
1. Edit Form, get new prefill URL
2. Extract all `entry.xxxxx` IDs
3. Update `shared/formFields.ts` mapping
4. Restart dev server to pick up changes

### Debugging Apps Script
- Apps Script has limited debugging - console.log goes to Executions log
- Best practice: write logic in `format.ts` with Vitest tests, keep `index.ts` minimal
- Test end-to-end by submitting a form and checking Google Doc output

## Dependencies Notes

### Core
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety across all code

### Testing
- **Vitest** - Unit/integration test runner (Vite-native)
- **Playwright** - E2E browser testing
- **MSW** - Mock Service Worker for API mocking
- **@testing-library/react** - React component testing utilities

### Netlify
- **@netlify/functions** - Types for serverless function handlers

### Development
- **ESLint** - Linting (flat config with TypeScript, React hooks, React Refresh plugins)
- **Prettier** - Code formatting (configured via `prettier.config.cjs`)
- **Husky** - Git hooks (`npm run prepare` installs hooks)
