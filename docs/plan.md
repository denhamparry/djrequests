# DJ Song Request Website Plan

**Status:** Draft
**Updated:** 2025-10-02
**Purpose:** Outline the initial implementation strategy for a website that surfaces searchable music results and routes song requests through Google Workspace.

## Goals & Success Criteria

- Allow visitors to search by song title, artist, or album and return relevant matches with minimal latency.
- Provide a frictionless path to request a track that captures caller details and writes the submission stream into a Google Doc via Google Forms.
- Maintain a lightweight architecture that can be operated by a single DJ without ongoing engineering support, hosted on a free Netlify or GitHub Pages tier.

## User Journey Overview

1. Visitor opens the site and sees a prominent search bar plus recent request highlights.
2. As the user types, the site displays API-backed matches (artist, song, album art, release year).
3. User selects a track and launches a request modal containing a pre-filled Google Form.
4. Submission posts to Google Form; the associated Google Sheet/Doc updates automatically for DJ consumption, where the DJ manually curates the playlist.

## Architecture Snapshot

- **Frontend:** Single-page app (Next.js or Vite + React) deployed on Vercel/Netlify for quick iteration, using client-side search calls with debounced input.
- **API Layer:** Start with a free catalog search provider (Apple/iTunes Search API or Deezer). Evaluate Spotify Web API if catalogue coverage or authenticated features are needed; hide tokens via serverless proxy.
- **Google Workspace Bridge:** Utilize a Google Form linked to a Google Sheet, with an Apps Script that mirrors new rows into a formatted Google Doc playlist.
- **State & Storage:** No persistent backend beyond Google Workspace; cache search results in-memory per session.

## Key Workstreams

- **Music API Integration**
  - Evaluate API options (auth flow, rate limits, cost).
  - Implement search endpoint wrapper and response normalization (title, artist, album, cover art URL).
  - Handle pagination, error states, and empty results gracefully.
- **UI/UX & Frontend Build**
  - Create responsive layout, search bar with debounce, and results list cards.
  - Provide feedback states (loading, no results, API errors) and highlight matched query terms.
  - Build request CTA that opens the Google Form in an embedded iframe or new tab with querystring pre-fill.
  - Capture audio preview support as an enhancement; design results cards with placeholder space for play controls on mobile.
- **Google Workspace Automation**
  - Configure Google Form and connected Sheet capturing requester name, dedication, preferred timeslot, and track metadata.
  - Write Apps Script to sync Sheet entries into a readable Google Doc queue; include timestamp and status fields.
  - Explore notifications (email or mobile push) for new requests.
- **Infrastructure & Tooling**
  - Set up repository structure, linting (`eslint`, `prettier`), testing (`vitest`/`jest`), and deployment pipeline.
  - Add env management for API keys (e.g., `.env.local`, Vercel secrets).
  - Document onboarding steps in `README.md` and `CLAUDE.md`.

## Milestones & Deliverables

1. **Discovery (Today, AM):** Finalize API choice, confirm Google Workspace permissions, draft wireframes, answer open questions.
   - Compare iTunes Search, Deezer API, and Spotify in terms of cost and auth.
   - Collect homepage imagery and mobile-first layout references.
2. **Prototype (Today, Midday):** Build search UI with mocked data, configure Google Form + Doc sync, validate end-to-end flow manually.
3. **MVP (Today, Afternoon):** Integrate live API, implement responsive mobile design, add basic analytics (page views, search frequency), and document audio preview roadmap.
4. **Launch Prep (Today, Evening):** Harden error handling, write documentation, run usability walkthrough, deploy to Netlify or GitHub Pages, and schedule future design polish.

## Risks & Mitigations

- **API rate limits or auth complexity:** Choose provider with generous free tier; implement serverless proxy caching.
- **Google Form latency syncing to Doc:** Schedule Apps Script triggers at shorter intervals; provide manual refresh link in Doc.
- **User privacy:** Limit required form fields; include consent notice; secure API keys in environment variables.
- **Mobile usability before UI polish:** Ship functional mobile-first views early and backlog advanced styling until after MVP validation.
- **One-day timeline:** Focus on critical path features (search, request form, Netlify deployment) and defer nice-to-haves (previews, analytics dashboards, advanced theming).

## Open Questions

- Confirm final API selection post-evaluation (likely iTunes Search or Deezer unless Spotify features are required).
- What branding/assets (logo, color palette) should guide the UI once we enter the design phase?
- Any reporting requirements beyond the Google Doc playlist?
