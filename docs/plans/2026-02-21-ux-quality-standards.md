# Phantom Workspace: UX Quality Standards

> Every pixel earns its place. Every interaction tells the user "we thought about this."
> This document defines the quality bar for Phantom. If a component does not meet these standards, it does not ship.

---

## 1. Animation and Transitions

### Timing Curves

| Context | Duration | Easing | Example |
|---------|----------|--------|---------|
| Micro-feedback (button press, toggle) | 100ms | `cubic-bezier(0.2, 0, 0, 1)` | Button scale on click |
| State change (tab switch, card update) | 200ms | `cubic-bezier(0.2, 0, 0, 1)` | Status badge color change |
| Layout shift (sidebar expand, split resize) | 300ms | `cubic-bezier(0.32, 0.72, 0, 1)` | Split pane drag release |
| View transition (route change) | 250ms | `cubic-bezier(0.2, 0, 0, 1)` | Dashboard to Diagram view |
| Entry/reveal (card appear, dropdown open) | 250ms | `cubic-bezier(0, 0, 0, 1)` | Analysis card appearing |
| Exit/dismiss (dropdown close, toast dismiss) | 150ms | `cubic-bezier(0.32, 0, 0.67, 0)` | Dropdown closing |

### What MUST Be Animated

- **Route transitions**: Cross-fade between views. The outgoing view fades out while the incoming view fades in. Never a hard cut.
- **Sidebar selection**: The active indicator slides to the new item (not jumps).
- **Card status changes**: Status badges transition color smoothly (e.g., "running" blue -> "completed" green).
- **Split pane resize**: The divider follows the cursor at 60fps. On release, panes settle with spring easing.
- **Dropdown menus**: Scale from 95% + fade in. Exit is fade out only (faster).
- **Tooltips**: Fade in with 400ms delay. Fade out immediately on leave.
- **Loading indicators**: Pulse or shimmer. Never static.
- **Scroll**: Use native momentum scrolling. Never override scroll physics.
- **Branch list updates**: New branches slide in; removed branches fade out.

### What MUST NOT Be Animated

- Terminal rendering. The canvas is performance-critical. Zero animation overhead.
- Cursor blink timing (handled by the terminal emulator).
- Data table sorting (instant, no transition).

### Rules

- Never animate layout properties (`width`, `height`, `top`, `left`) directly. Use `transform` and `opacity`.
- Never use `transition: all`. Be explicit about which properties transition.
- Respect `prefers-reduced-motion`. When set, collapse all animation durations to 0ms except loading indicators (which should switch from animation to a static indicator).
- Every animation must be interruptible. If the user clicks during a 300ms transition, the new action starts immediately from the current interpolated state.

---

## 2. Loading States

### Skeleton Screens (Preferred)

Use skeleton screens for content that has a known shape:

- **Sidebar branch list**: Gray pill shapes at branch-item height.
- **Dashboard cards**: Card outlines with shimmer placeholder for title, status badge, and summary text.
- **Diagram canvas**: Empty canvas with centered ghost nodes (gray rounded rects at expected positions).
- **Preset list**: Card outlines matching preset card dimensions.

Skeleton shimmer: A left-to-right linear gradient sweep at 1.5s cycle, using `background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%)` with `background-size: 200% 100%`.

### Spinners

Use spinners only when the shape of the result is unknown or the operation is brief:

- **Analysis job running**: Small spinner (16px) inline with status text. Not a full-page spinner.
- **CLI subprocess starting**: Small spinner next to preset card's "Launch" button. Replaces button text.
- **Git operations**: Inline spinner in sidebar branch section header.

### Rules

- **Never show a blank screen.** If data is loading, show a skeleton. If the view is empty, show an empty state (see below).
- **Never show a spinner for more than 3 seconds without progress text.** If an operation takes longer, show estimated progress or a message like "Analyzing 142 files..."
- **Loading states must be instantaneous.** The skeleton must appear within 16ms of navigation. Use `React.Suspense` with skeleton fallbacks.
- **Prevent layout shift.** Skeleton dimensions must match real content dimensions. When data loads, content must replace skeleton without the page jumping.
- **Consider the fast path.** If data loads in under 100ms, do NOT flash a skeleton. Use a 100ms delay before showing any loading indicator.

---

## 3. Empty States

Every view and component must handle the "nothing here yet" case. An empty state is an opportunity, not a void.

### Required Empty States

| Component | Empty State |
|-----------|-------------|
| **Sidebar branch list** | "No repository detected" with hint text and a "Open Repository" action. |
| **Dashboard (no presets)** | Illustration placeholder + "Set up your first analysis" heading + brief description + primary CTA button "Create Preset". |
| **Dashboard (presets exist, no runs)** | Each card shows "Not yet run" with a "Run Now" button prominently styled. |
| **Diagram view (no analysis)** | Centered message: "Run an architecture analysis to see your codebase visualized" + action button. |
| **Terminal view (no sessions)** | "No terminal sessions" + grid of quick-launch buttons for each CLI preset, or a single "New Terminal" button if no presets exist. |
| **Preset list (no presets)** | "Create your first preset" with inline form or link to preset editor. |
| **Search results (no matches)** | "No results for [query]" with suggestions or "Clear filters" link. |

### Rules

- Every empty state has: (1) a short heading, (2) one sentence of context, (3) a primary action.
- Empty states use `var(--text-secondary)` for text, not `var(--text-primary)`. They should feel subdued, not alarming.
- Never use generic messages like "No data" or "Nothing to show." Be specific to the context.
- Empty states should be visually centered in their container, both horizontally and vertically.

---

## 4. Error States

### Error Hierarchy

| Severity | Treatment | Example |
|----------|-----------|---------|
| **Fatal** (app cannot continue) | Full-screen error with restart action. Red accent. | Database corruption, Tauri IPC failure |
| **Blocking** (feature broken) | Inline error banner at top of affected view. | Analysis CLI not found, git not available |
| **Recoverable** (action failed) | Toast notification + retry action. | Analysis job failed, network timeout |
| **Validation** (user input) | Inline below the field. Red text, no toast. | Invalid preset name, empty prompt |

### Error Communication

- **Lead with what happened**, not the technical reason. "Analysis failed" not "Process exited with code 1".
- **Follow with what to do.** Every error message includes a next action: Retry, Edit, Dismiss, or Report.
- **Show technical details on demand.** A "Show Details" expandable section for the raw error, not in the primary message.
- **Never show raw Rust errors to the user.** All `Err(String)` from Tauri commands must be mapped to user-friendly messages on the frontend.

### Retry Patterns

- **Automatic retry**: For transient failures (network, subprocess timeout), retry once automatically after 2 seconds. Show "Retrying..." inline.
- **Manual retry**: For deterministic failures (bad config, missing binary), show a "Retry" button but do not auto-retry.
- **Exponential backoff**: For git polling failures, back off 2s -> 4s -> 8s -> 16s -> cap at 30s. Show "Reconnecting..." with countdown.

### Rules

- Errors must never block the entire UI. A failed analysis does not prevent terminal usage.
- Toast notifications auto-dismiss after 5 seconds for recoverable errors. Fatal/blocking errors persist until dismissed.
- Error states in cards: Replace the card content area with the error message and retry button. Do NOT pop a modal.

---

## 5. Microinteractions

### Hover Effects

- **Sidebar nav items**: Background transitions to `var(--bg-tertiary)` on hover. 100ms transition.
- **Branch items**: Same as nav items, plus the commit SHA fades in from 0 opacity on hover.
- **Dashboard cards**: Subtle `translateY(-1px)` lift + shadow increase. 150ms transition.
- **Buttons**: Background lightens one step. Primary buttons: accent color brightens. 100ms.
- **Diagram nodes**: Border highlights to accent color. Connected edges brighten. 100ms.
- **Split dividers**: Divider widens from 1px to 4px and changes color to accent. Cursor changes to `col-resize` or `row-resize`.

### Click/Press Feedback

- **Buttons**: Scale to `0.98` on `:active`, return on release. Combined with color shift.
- **Cards**: Scale to `0.995` on press (subtle, not cartoonish).
- **Sidebar items**: Immediate background change (no delay). The active indicator transitions position.
- **Diagram nodes**: Brief flash of accent color border (100ms).

### Focus Indicators

- All focusable elements must have a visible focus ring.
- Focus ring: `2px solid var(--accent)` with `2px offset`, `border-radius` matching the element.
- Focus ring appears on keyboard navigation (`:focus-visible`), NOT on mouse click.
- Tab order must be logical: sidebar nav -> main content -> status bar.

### Drag Interactions

- **Split dividers**: Preview line follows cursor. Minimum pane size enforced (80px). Snap-to-edge when within 20px of edge (collapses pane).
- **Tab reorder**: Tab lifts with shadow on drag start. Ghost tab shows insertion point. Drop with spring settle animation.
- **Diagram pan**: Immediate response (no inertia delay). Smooth 60fps.

---

## 6. Typography Scale and Spacing System

### Type Scale

| Token | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| `--text-xl` | 20px | 600 | 1.3 | View headings (Dashboard, Diagrams) |
| `--text-lg` | 15px | 600 | 1.4 | Card titles, section headers |
| `--text-md` | 13px | 400 | 1.5 | Body text, descriptions, nav items |
| `--text-sm` | 12px | 400 | 1.4 | Secondary text, timestamps, labels |
| `--text-xs` | 11px | 500 | 1.3 | Badges, section labels (e.g., "BRANCHES"), status bar |
| `--text-mono` | 13px | 400 | 1.3 | Code, terminal references, SHA hashes |

### Font Stack

- **UI text**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif`
- **Monospace**: `"SF Mono", "Menlo", "Monaco", "Cascadia Code", "Courier New", monospace`

The monospace stack is used for: terminal rendering, commit SHAs, code snippets in analysis results, mermaid source display, and the status bar's session/job counts.

### Spacing Scale

Use a 4px base unit. All spacing values are multiples of 4.

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight inline spacing (badge padding, icon gaps) |
| `--space-2` | 8px | Default inline spacing (button padding, list item gap) |
| `--space-3` | 12px | Component internal padding (card padding, sidebar item padding) |
| `--space-4` | 16px | Section spacing (gap between cards, view padding) |
| `--space-5` | 20px | Major section spacing (view top padding) |
| `--space-6` | 24px | Large gaps (between card grid sections) |
| `--space-8` | 32px | Page-level margins |

### Rules

- Never use arbitrary pixel values. All spacing references the scale above.
- Labels and section headers use `text-transform: uppercase` with `letter-spacing: 0.05em` at `--text-xs`.
- Paragraph text (analysis findings, descriptions) has max-width of 640px for readability.
- Numbers in status displays use tabular-nums (`font-variant-numeric: tabular-nums`) so counters don't shift layout.

---

## 7. Color System

### Design Tokens

```css
:root {
  /* Backgrounds - darkest to lightest */
  --bg-primary:    #0a0a0a;   /* App background, terminal */
  --bg-secondary:  #111111;   /* Sidebar, panels */
  --bg-tertiary:   #1a1a1a;   /* Cards, elevated surfaces */
  --bg-hover:      #222222;   /* Hover states */
  --bg-active:     #2a2a2a;   /* Active/pressed states */

  /* Borders */
  --border-default: #2a2a2a;  /* Subtle dividers */
  --border-strong:  #3a3a3a;  /* Emphasized dividers (split handles) */

  /* Text */
  --text-primary:   #e0e0e0;  /* Primary content */
  --text-secondary: #888888;  /* Labels, descriptions, hints */
  --text-tertiary:  #555555;  /* Disabled text, placeholders */

  /* Accent (purple, used for primary actions and focus) */
  --accent:         #7c6aef;
  --accent-hover:   #8f7ff7;
  --accent-muted:   rgba(124, 106, 239, 0.15);  /* Accent backgrounds */

  /* Semantic */
  --success:        #4caf50;  /* Running, connected, new (diff) */
  --success-muted:  rgba(76, 175, 80, 0.15);
  --warning:        #ffc107;  /* Modified (diff), caution */
  --warning-muted:  rgba(255, 193, 7, 0.15);
  --error:          #f44336;  /* Failed, removed (diff), dead */
  --error-muted:    rgba(244, 67, 54, 0.15);
  --info:           #2196f3;  /* Running jobs, progress */
  --info-muted:     rgba(33, 150, 243, 0.15);
}
```

### Contrast Requirements

- All text on `--bg-primary` must meet WCAG AA (4.5:1 minimum). `--text-primary` on `--bg-primary` = 13.3:1 (passes). `--text-secondary` on `--bg-primary` = 5.2:1 (passes).
- `--text-tertiary` is reserved for disabled/placeholder content only. It does NOT pass AA on dark backgrounds and must never carry essential information.
- Status badges: White text on semantic color backgrounds. Ensure 4.5:1 contrast.
- Interactive elements (links, buttons) must have 3:1 contrast against adjacent non-interactive elements.

### Usage Rules

- **Surfaces layer**: `--bg-primary` (base) < `--bg-secondary` (panels) < `--bg-tertiary` (cards) < `--bg-hover` < `--bg-active`. Surfaces closer to the user are lighter. Never reverse this order.
- **Semantic colors are for meaning, not decoration.** Green means success/new. Red means error/removed. Yellow means caution/modified. Blue means informational/in-progress. Never use semantic colors for branding or aesthetics.
- **Diff annotations** (diagram view):
  - New nodes: `--success` border, `--success-muted` fill.
  - Removed nodes: `--error` border, `--error-muted` fill. Dashed border.
  - Modified nodes: `--warning` border, `--warning-muted` fill.
  - Unchanged nodes: `--border-default` border, `--bg-tertiary` fill.

---

## 8. Keyboard Navigation

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+1` | Switch to Terminal view |
| `Cmd+2` | Switch to Dashboard view |
| `Cmd+3` | Switch to Diagrams view |
| `Cmd+4` | Switch to Launcher view |
| `Cmd+T` | New terminal session |
| `Cmd+W` | Close current terminal tab |
| `Cmd+Shift+\|` | Split terminal vertically |
| `Cmd+Shift+-` | Split terminal horizontally |
| `Cmd+[` / `Cmd+]` | Navigate split panes |
| `Cmd+Shift+[` / `Cmd+Shift+]` | Switch terminal tabs |
| `Cmd+K` | Command palette (future, but reserve the shortcut now) |
| `Escape` | Close dropdown/modal, return focus to main content |

### Focus Management

- On route change, focus moves to the first focusable element in the new view.
- Opening a modal traps focus inside it. `Escape` closes and returns focus to the trigger element.
- Dropdowns are navigable with arrow keys. `Enter` selects. `Escape` closes.
- The terminal captures all keyboard input when focused. `Cmd+Shift+P` (or equivalent) escapes to the app shell.
- Tab order within the sidebar: nav items first, then branch list. Arrow keys navigate within each group.

### Rules

- Every action available via mouse click must be reachable and executable via keyboard.
- Keyboard shortcuts must not conflict with OS or browser defaults.
- On macOS, use `Cmd`. The app should map `Ctrl` on other platforms automatically.
- The sidebar, main content, and status bar are separate focus regions. `F6` cycles between regions.

---

## 9. Responsive Behavior (Window Resizing)

### Minimum Window Size

- Minimum: 800 x 500 pixels. Set via Tauri window config. Below this, the window cannot be resized smaller.

### Breakpoints (within the Tauri window)

| Window Width | Behavior |
|-------------|----------|
| >= 1200px | Full layout: sidebar expanded (220px) + main content |
| 800-1199px | Sidebar collapses to icons only (48px). Labels hidden. Tooltip on hover shows label. |
| < 800px | Not supported (minimum window size prevents this) |

### Component Responsiveness

- **Dashboard cards**: CSS Grid, `auto-fill` with `minmax(280px, 1fr)`. Cards flow naturally.
- **Diagram canvas**: React Flow handles its own viewport. Minimap repositions to bottom-right on small windows.
- **Terminal splits**: Minimum pane width/height of 80px. Below that, the pane collapses entirely with a click-to-expand affordance.
- **Status bar**: Fixed height (28px). Items truncate with ellipsis. Priority: branch name > job count > session count. Lowest-priority items hide first.
- **Breadcrumb trail**: Truncates from the left. Shows "... > Service > Function" when the trail is too long.

### Rules

- No horizontal scrollbars anywhere in the app shell. Content truncates or wraps.
- The terminal canvas always fills its container exactly. The backend resize event is debounced at 100ms.
- Sidebar width is not user-adjustable (fixed at 220px or 48px based on breakpoint). Only split panes are draggable.

---

## 10. Component Acceptance Criteria

### Sidebar

- [ ] Nav items highlight on hover within 100ms
- [ ] Active nav item has a visible accent indicator that slides (not jumps) when switching
- [ ] Branch list loads with skeleton placeholders, then populates without layout shift
- [ ] Current branch is visually distinct (accent color or bold)
- [ ] Clicking a branch switches workspace context; all views update
- [ ] Sidebar collapses to icon-only at narrow window widths with smooth transition
- [ ] All items are keyboard-navigable with arrow keys
- [ ] Tooltip appears on hover over collapsed icon items (400ms delay)
- [ ] "New" button or action is always visible and accessible

### Dashboard Cards

- [ ] Cards appear with skeleton loading state that matches final card dimensions
- [ ] Status badges animate color changes (running -> completed)
- [ ] "Running" status shows an inline spinner and elapsed time
- [ ] "Failed" status shows error summary with "Show Details" expander and "Retry" button
- [ ] "Completed" status shows findings summary (first 2-3 lines)
- [ ] Cards lift subtly on hover (translateY -1px + shadow)
- [ ] Cards scale subtly on press (0.995)
- [ ] Clicking a card navigates to detailed view / diagram
- [ ] "Run" and "Cancel" buttons have loading states (spinner replaces text during action)
- [ ] Diff summary (branch vs main) shows +/- counts with semantic colors
- [ ] Empty dashboard shows purposeful empty state with CTA
- [ ] Cards reflow responsively in a CSS Grid
- [ ] Real-time Tauri event updates reflect within 100ms (no polling delay)

### Diagram Viewer

- [ ] Canvas renders within 500ms of navigation (with skeleton during load)
- [ ] Pan/zoom is 60fps with no jank
- [ ] Nodes have hover states (border highlights to accent, connected edges brighten)
- [ ] Clicking a node triggers drill-down with a breadcrumb update
- [ ] Breadcrumb segments are clickable to navigate up
- [ ] Breadcrumb truncates gracefully on narrow windows
- [ ] Diff mode: nodes color-coded (green/red/yellow/gray) with legend visible
- [ ] Toggle between diff and clean view animates node color transitions (200ms)
- [ ] Minimap present for graphs with more than 10 nodes
- [ ] Empty state when no analysis has been run yet
- [ ] Error state when analysis failed (inline, not modal)
- [ ] Export button (PNG/SVG) is accessible and provides feedback ("Exported!" toast)

### Terminal View (Splits and Tabs)

- [ ] Initial terminal session starts within 300ms of view mount
- [ ] Split dividers show resize cursor and widen on hover (1px -> 4px)
- [ ] Drag resize is 60fps, smooth, minimum pane size enforced
- [ ] Tab bar shows session titles; active tab is visually distinct
- [ ] Tab close button appears on hover; clicking closes with fade-out transition
- [ ] New tab button is always visible in the tab bar
- [ ] Terminal focus is indicated by a subtle border/glow on the focused pane
- [ ] Keyboard shortcuts for split/tab operations work when terminal is focused
- [ ] Sessions persist when switching views (terminal stays alive behind dashboard)
- [ ] Exited sessions show "exited" indicator; the terminal content remains visible (not cleared)
- [ ] Empty terminal view shows quick-launch options, not a blank screen

### Status Bar

- [ ] Fixed at bottom, 28px height, never scrolls
- [ ] Shows current branch name (truncated with ellipsis if long)
- [ ] Shows running job count (updates in real-time via events)
- [ ] Shows active session count
- [ ] Items use tabular-nums so counters don't shift layout
- [ ] Clicking branch name could open branch switcher (future consideration, but don't block on it)
- [ ] All text is legible at the small size (--text-xs, meets contrast requirements)
- [ ] Status bar adapts when window narrows: lowest-priority items hide first

### CLI Launcher

- [ ] Preset cards show CLI name, icon/indicator, flags summary
- [ ] "Launch" button has loading state (spinner while PTY spawns)
- [ ] Launching a preset immediately switches to terminal view with the new session focused
- [ ] "New Preset" form validates inputs inline (red underline, specific error text)
- [ ] Empty preset list shows helpful empty state with explanation of what presets are
- [ ] Preset deletion requires confirmation (small inline "Are you sure?" not a modal)

---

## 11. Anti-Patterns (Things That Will Get Your PR Rejected)

1. **Flash of blank content** -- Navigating to a view and seeing white/black for any frame before content or skeleton appears.
2. **Layout shift on load** -- Content jumping as data loads. Skeletons must match final dimensions.
3. **Raw error strings** -- Showing Rust `Err(...)` messages or stack traces to the user.
4. **Unstyled focus rings** -- Browser default blue outline instead of our custom focus ring.
5. **Missing hover states** -- Any clickable element without a visual hover response.
6. **Hard cuts** -- View changes, status changes, or element appearances without transitions.
7. **Spinners over skeletons** -- Using a centered spinner when a skeleton screen is more appropriate.
8. **Orphaned states** -- A "Running" badge with no way to cancel. A "Failed" card with no retry. A modal with no close.
9. **Unresponsive drag** -- Split dividers or drag interactions that don't track the cursor smoothly.
10. **Invisible keyboard traps** -- Focus getting stuck in a component with no way to escape via keyboard.
11. **Double-click issues** -- Buttons that trigger actions twice if double-clicked. All action buttons must be debounced or disabled during execution.
12. **Stale data** -- Showing cached data after an action that should invalidate it. If the user clicks "Rerun," the old results must be replaced immediately with a loading state.

---

## 12. Performance Budget

| Metric | Target |
|--------|--------|
| First Contentful Paint (app launch to visible UI) | < 500ms |
| Time to Interactive (terminal ready for input) | < 1s |
| Route transition (click to new view visible) | < 100ms |
| Terminal input latency (keypress to pixel) | < 16ms (1 frame) |
| Terminal scroll (60fps continuous scroll) | 0 dropped frames |
| Diagram render (< 50 nodes) | < 200ms |
| Diagram render (50-200 nodes) | < 500ms |
| Memory (idle, single terminal) | < 150MB |
| Memory per additional terminal session | < 30MB |
| CSS bundle size | < 20KB gzipped |
| JS bundle size (main) | < 200KB gzipped |

---

## Summary

The standard is simple: at every moment, the user should feel in control, informed, and unhurried. The interface should feel responsive but never frantic, polished but never ornamental. Every state -- loading, empty, error, success -- is designed. Nothing is left to chance.
