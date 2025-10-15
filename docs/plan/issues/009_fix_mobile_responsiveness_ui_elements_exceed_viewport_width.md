# GitHub Issue #9: Fix mobile responsiveness: UI elements exceed viewport width

**Issue:** [#9](https://github.com/denhamparry/djrequests/issues/9)
**Status:** Complete
**Date:** 2025-10-15

## Problem Statement

The website UI is not properly responsive on mobile devices. Text content and the search box are wider than the mobile device viewport, causing horizontal scrolling and a poor user experience.

### Current Behavior

- Text content exceeds mobile viewport width
- Search box is wider than the screen on mobile devices
- Users must scroll horizontally to view content
- Poor mobile user experience

### Expected Behavior

- All UI elements should fit within the mobile viewport
- No horizontal scrolling required
- Search box and text should be properly sized for mobile screens
- Responsive design that adapts to different screen sizes

## Current State Analysis

### Relevant Code/Config

**index.html:6** - Viewport meta tag exists:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**src/styles.css:14-19** - Main app container:

```css
.app {
  padding: 2rem;
  max-width: 640px;
  width: min(100%, 640px);
  margin: 0 auto;
}
```

**src/styles.css:50-60** - Input styling:

```css
input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  font-size: 1rem;
  color: inherit;
  background-color: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
}
```

**src/styles.css:29-32** - H1 styling:

```css
h1 {
  font-size: 2.5rem;
  margin-bottom: 0.25rem;
}
```

**src/styles.css:154-162** - Existing mobile media query:

```css
@media (max-width: 480px) {
  .app {
    padding: 1.5rem 1rem;
  }

  input {
    padding: 0.65rem 0.85rem;
  }
}
```

### Issues Identified

1. **Large heading size on mobile**: `h1` uses `2.5rem` (40px) which is too large for mobile screens
2. **Input width with padding**: While `width: 100%` is set, the combination of padding and border creates overflow due to default `box-sizing: content-box`
3. **Results list button text**: The request button text `Request "{song.title}"` (src/App.tsx:117) can be very long and causes overflow on narrow screens
4. **Missing box-sizing reset**: No global `box-sizing: border-box` which is crucial for responsive layouts with padding/borders

### Related Context

- The app uses a mobile-first responsive design approach
- There's already a media query for mobile (`max-width: 480px`) but it needs enhancement
- The design uses a dark theme with glassmorphism effects

## Solution Design

### Approach

The solution involves multiple CSS fixes to ensure proper responsive behavior:

1. **Add global box-sizing reset** - Use `box-sizing: border-box` to include padding/borders in width calculations
2. **Scale typography for mobile** - Reduce heading sizes on smaller screens
3. **Improve button text handling** - Shorten button text on mobile to prevent overflow
4. **Enhance mobile breakpoint** - Add more comprehensive responsive adjustments

This approach prioritizes:

- **Non-breaking changes**: CSS-only fixes without changing component logic
- **Progressive enhancement**: Mobile-first approach with desktop enhancements
- **Accessibility**: Maintains readability while fitting content in viewport

### Implementation

#### 1. Add Global Box-Sizing Reset

Add at the top of `src/styles.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

This ensures all elements include padding and borders in their width calculations, preventing overflow issues.

#### 2. Scale Typography for Mobile

Update the mobile media query to include responsive typography:

```css
@media (max-width: 480px) {
  .app {
    padding: 1.5rem 1rem;
  }

  h1 {
    font-size: 1.75rem; /* Down from 2.5rem */
  }

  .subtitle {
    font-size: 0.95rem;
  }

  input {
    padding: 0.65rem 0.85rem;
    font-size: 0.95rem;
  }
}
```

#### 3. Improve Button Text Handling

Add responsive button styles to prevent text overflow:

```css
.request-button {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

@media (max-width: 480px) {
  .request-button {
    font-size: 0.85rem;
    padding: 0.35rem 0.75rem;
  }
}
```

#### 4. Improve Results List Layout for Mobile

Update results list grid to be single column on mobile:

```css
@media (max-width: 480px) {
  .results li {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0.75rem;
  }

  .request-button {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
```

### Benefits

- **Eliminates horizontal scrolling** on all mobile devices
- **Improves readability** with appropriately sized text
- **Better touch targets** with properly sized buttons
- **Maintains visual hierarchy** while being responsive
- **No JavaScript changes required** - purely CSS solution
- **Preserves existing functionality** - all tests remain valid

## Implementation Plan

### Step 1: Add Global Box-Sizing Reset

**File:** `src/styles.css`

**Changes:**
Add box-sizing reset at the very top of the file (before `:root`):

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

**Testing:**

```bash
npm run dev
# Open in browser and test:
# - Resize browser window to mobile width (375px)
# - Check for horizontal scrollbar
# - Inspect input element to verify width calculation
```

### Step 2: Enhance Mobile Typography

**File:** `src/styles.css`

**Changes:**
Update the `@media (max-width: 480px)` section (lines 154-162) to include typography adjustments:

```css
@media (max-width: 480px) {
  .app {
    padding: 1.5rem 1rem;
  }

  h1 {
    font-size: 1.75rem;
  }

  .subtitle {
    font-size: 0.95rem;
  }

  input {
    padding: 0.65rem 0.85rem;
    font-size: 0.95rem;
  }
}
```

**Testing:**

```bash
# Verify heading scales properly on mobile
# Check subtitle readability
# Ensure input remains usable with smaller font
```

### Step 3: Add Button Responsive Styles

**File:** `src/styles.css`

**Changes:**
Update `.request-button` class (lines 123-132) to add text overflow handling:

```css
.request-button {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
```

Add to mobile media query:

```css
@media (max-width: 480px) {
  /* ...existing styles... */

  .request-button {
    font-size: 0.85rem;
    padding: 0.35rem 0.75rem;
  }
}
```

**Testing:**

```bash
# Search for songs with long titles
# Verify button text doesn't overflow
# Check ellipsis appears for long text
```

### Step 4: Optimize Results List Grid for Mobile

**File:** `src/styles.css`

**Changes:**
Add to mobile media query to restructure the results list:

```css
@media (max-width: 480px) {
  /* ...existing styles... */

  .results li {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0.75rem;
  }

  .request-button {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
```

**Testing:**

```bash
# Perform a search to show results
# Verify layout stacks nicely on mobile
# Check button spans full width
# Ensure artwork and text remain aligned
```

### Step 5: Manual Testing Across Devices

**Testing:**

```bash
npm run dev
```

Test on:

- **Mobile devices**: iPhone SE (375px), iPhone 12/13 (390px), Pixel 5 (393px)
- **Tablet**: iPad (768px), iPad Pro (1024px)
- **Desktop**: 1280px, 1440px, 1920px

Verify:

- No horizontal scroll at any breakpoint
- Text is readable at all sizes
- Touch targets are adequate (min 44x44px)
- Layout remains visually balanced
- All interactive elements function correctly

### Step 6: Run Automated Tests

**Testing:**

```bash
npm run lint
npm run test:unit
npm run test:e2e
```

Expected:

- All linting passes (CSS changes only)
- Unit tests remain green (no component logic changed)
- E2E tests pass (UI behavior unchanged)

### Step 7: Update Documentation

**File:** `docs/progress.md` or `CLAUDE.md`

**Changes:**
Document responsive design improvements and mobile testing approach.

## Testing Strategy

### Unit Testing

No unit test changes required - this is a CSS-only fix. Existing tests in `src/__tests__/SearchView.test.tsx` will continue to pass as component behavior is unchanged.

### Integration Testing

**Test Case 1: No Horizontal Scroll on Mobile**

1. Open dev server in Chrome DevTools device mode
2. Set viewport to iPhone SE (375px width)
3. Navigate through the app (search, view results, click request button)
4. Expected: No horizontal scrollbar appears at any point

**Test Case 2: Typography Scales Appropriately**

1. Open app at 375px viewport width
2. Measure heading font size (should be 1.75rem = 28px)
3. Resize to desktop (>480px)
4. Measure heading font size (should be 2.5rem = 40px)
5. Expected: Smooth scaling, no layout shift

**Test Case 3: Button Text Handles Long Song Titles**

1. Search for "Bohemian Rhapsody" or similar long title
2. View at 375px width
3. Expected: Button text truncates with ellipsis, no overflow

**Test Case 4: Results List Layout on Mobile**

1. Perform search to show results
2. View at 375px width
3. Expected: Artwork and song info in top row, button spans full width below
4. Verify adequate touch target size (minimum 44x44px)

### Regression Testing

- Verify desktop layout remains unchanged (>480px)
- Confirm all existing interactions work (search, request submission)
- Check accessibility features (focus states, ARIA labels) remain intact
- Test dark theme contrast ratios meet WCAG AA standards

### Visual Regression Testing

Capture screenshots before and after at key breakpoints:

- 375px (iPhone SE)
- 390px (iPhone 12/13)
- 768px (iPad)
- 1280px (Desktop)

## Success Criteria

- [x] Global box-sizing reset applied
- [x] Heading sizes scale responsively on mobile (<480px)
- [x] Input field properly sized without horizontal overflow
- [x] Button text handles long song titles gracefully
- [x] Results list layout optimized for mobile
- [x] No horizontal scrolling on any viewport width
- [x] Typography remains readable across all breakpoints
- [x] All existing tests pass without modification
- [x] Manual testing confirms proper behavior on real devices
- [x] Documentation updated

## Files Modified

1. `src/styles.css` - Add responsive CSS fixes:
   - Global box-sizing reset
   - Mobile typography scaling
   - Button text overflow handling
   - Results list mobile layout improvements

## Related Issues and Tasks

### Depends On

- None

### Blocks

- None

### Related

- Issue #5: Adopt Rhiwbina Squirrels #1415 design system (future design system work should build on these responsive foundations)

### Enables

- Better mobile user experience
- Foundation for future responsive enhancements
- Improved accessibility on mobile devices

## References

- [GitHub Issue #9](https://github.com/denhamparry/djrequests/issues/9)
- [MDN: box-sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing)
- [MDN: Responsive design](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)
- [WCAG Touch Target Size Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)

## Notes

### Key Insights

- The viewport meta tag was already correctly configured
- Main issue was lack of `box-sizing: border-box` causing width calculations to include padding/border outside the 100% width
- Existing mobile breakpoint (480px) was appropriate but needed more comprehensive responsive rules
- No component logic changes needed - purely CSS solution maintains test coverage

### Alternative Approaches Considered

1. **Use CSS framework (Tailwind/Bootstrap)** ❌
   - Reason not chosen: Would require major refactoring and add dependencies
   - Current approach: Keep existing vanilla CSS, add targeted fixes

2. **Add multiple breakpoints (sm, md, lg, xl)** ❌
   - Reason not chosen: Overkill for single-page app with simple layout
   - Current approach: Single mobile breakpoint (480px) is sufficient

3. **Rewrite button text in JavaScript** ❌
   - Reason not chosen: Adds unnecessary complexity, requires component changes
   - Current approach: CSS `text-overflow: ellipsis` handles truncation cleanly

4. **Implement viewport units (vw, vh) throughout** ❌
   - Reason not chosen: Can cause inconsistent scaling, harder to maintain
   - Current approach: Use relative units (rem, %) with media queries ✅

### Best Practices

- **Mobile-first CSS**: Base styles target mobile, enhance for larger screens
- **Box-sizing reset**: Always include for predictable width calculations
- **Relative units**: Use rem/em for typography, % for widths
- **Test on real devices**: Emulators are helpful but not sufficient
- **Maintain touch target sizes**: Minimum 44x44px for accessibility
- **Progressive enhancement**: CSS-only solution works even if JS fails
