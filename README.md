# DJ Song Request Website

Web app that lets guests search for tracks, submit requests through a Google Form, and automatically surfaces each entry in a Google Doc queue for the DJ.

## ✅ Local Setup Checklist

- [ ] Install Node.js 20+ (check with `node -v`).
- [ ] Clone the repository and install dependencies: `npm install`.
- [ ] Copy `.env.example` to `.env.local` (create the example file if missing) and add any secrets once you provision them.
- [ ] Set `VITE_GOOGLE_FORM_URL` to your prefilled Form URL base (ending in `/viewform`).
- [ ] Update `apps-script/index.ts` with your Google Doc ID and the exact form field labels.
- [ ] Replace placeholder field IDs in `src/lib/googleForm.ts` with the real Google Form entry IDs.
- [ ] Run the unit/integration suite: `npm run test:unit`.
- [ ] (Optional) Install Playwright browsers if you plan to run e2e locally: `npx playwright install`.
- [ ] Start the dev server: `npm run dev` and open `http://localhost:5173`.

## 🧪 Test & Quality Commands

- `npm run lint` — ESLint flat config covering app, functions, and Apps Script helpers.
- `npm run test:unit` — Vitest suite (Netlify function, React hook, Apps Script formatter).
- `npm run test:e2e` — Playwright smoke test (spins up Vite dev server automatically).

## 🏗️ Project Layout

- `src/` — React app (search UI, hooks, form helper, MSW setup).
- `netlify/functions/` — Serverless proxy for the iTunes Search API plus tests.
- `apps-script/` — Utilities + entry point for Google Doc automation with Vitest coverage.
- `tests/e2e/` — Playwright specs.
- `docs/` — Planning docs and agent guide.

## 🔌 External Configuration

| Component | What to configure | Where |
| --- | --- | --- |
| Apple iTunes Search API | No auth needed, but watch rate limits (~20 req/min) | `netlify/functions/search.ts` |
| Google Form | Hidden fields for track metadata + guest info | Set base URL/IDs in `src/lib/googleForm.ts` |
| Google Doc | Target document for queue | `apps-script/index.ts` (`GOOGLE_DOC_ID`) |

## 📝 Google Form Setup

- Create a new Google Form titled “Song Request” (or similar) within your Google Workspace.
- Add visitor-facing fields:
  - Short answer: `Your Name` (optional)
  - Short answer: `Dedication / Message` (optional)
  - Short answer: `Contact Method` (optional)
- Add metadata questions you’ll prefill from the site (short answer works best):
  - `Track ID`
  - `Track Name`
  - `Artist Name`
  - `Album Name`
  - `Artwork URL`
  - `Preview URL`
- Click the three-dot menu → **Get pre-filled link**, populate each metadata field with dummy content, submit, and copy the generated URL:
  - Record every `entry.<number>` parameter and replace the placeholders in `src/lib/googleForm.ts`.
  - Use the same URL (without the sample values) as `VITE_GOOGLE_FORM_URL` inside `.env.local`.
- Link the Form to a Google Sheet (Responses tab → Link to Sheets). This Sheet feeds the Apps Script.
- Create or choose the Google Doc playlist and note its ID (string between `/d/` and `/edit`).
- Open Apps Script from the Form (More ⋮ → Script editor), paste the contents of `apps-script/index.ts`, swap `YOUR_DOC_ID_HERE` for your Doc ID, and deploy the script with an “On form submit” trigger.
- Submit a test via the prefilled Form link to confirm the Sheet captures data and the Doc receives a formatted entry.
- The web app submits requests server-side via the Netlify function, so guests never leave the site once the field IDs and Doc ID are configured.

## 🚀 Deployment

- Netlify recommended: connect repo, set build command `npm run build`, publish directory `dist`.
- Add environment variables via Netlify dashboard:
  - `GOOGLE_FORM_URL` (or `VITE_GOOGLE_FORM_URL`) — prefilled Form URL.
  - `ALLOWED_ORIGIN` — origin allowed to call the Netlify functions
    (e.g. `https://djrequests.netlify.app`). If unset, the functions fall
    back to Netlify's auto-provided `URL` env var, then to `*` as a last
    resort (useful for local `netlify dev`).
- Enable Netlify Functions for `netlify/functions/search.ts`.
- Optional fallback: GitHub Pages (requires proxy alternative for secrets).

## 🙋 Support Notes

- Logs and queue management happen inside the linked Google Doc.
- Adjust rate limiting or caching in `netlify/functions/search.ts` if you hit API limits.
