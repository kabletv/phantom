# Phantom Workspace -- Component Specifications

Visual design system and component specs for the Phantom AI development workspace. Dark theme only. Aesthetic: "invisible infrastructure" -- the UI disappears and you just see your work. Reference-quality developer tool (Linear, Raycast, Arc Browser tier).

---

## 1. Design System Foundation

### 1.1 Color Palette

#### Backgrounds
| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#09090b` | Window background, canvas |
| `--bg-surface` | `#111113` | Sidebar, cards, panels |
| `--bg-elevated` | `#1a1a1f` | Hover states, active panels, dropdowns |
| `--bg-overlay` | `#222228` | Modals, popovers, tooltips |
| `--bg-inset` | `#0d0d0f` | Recessed areas (textarea backgrounds, code blocks) |

#### Text
| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#ececf0` | Primary content, headings |
| `--text-secondary` | `#8b8b96` | Labels, descriptions, timestamps |
| `--text-tertiary` | `#5a5a65` | Placeholder text, disabled labels |
| `--text-inverse` | `#09090b` | Text on accent-colored backgrounds |

#### Accent
| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#7c6aef` | Primary interactive elements, active indicators |
| `--accent-hover` | `#8f7ff7` | Hover on accent elements |
| `--accent-muted` | `rgba(124, 106, 239, 0.12)` | Accent backgrounds (active nav item, selected card) |
| `--accent-subtle` | `rgba(124, 106, 239, 0.06)` | Hover backgrounds on neutral items |

#### Status
| Token | Hex | Usage |
|---|---|---|
| `--status-success` | `#3dd68c` | Completed, new (diff), healthy |
| `--status-error` | `#f25f5c` | Failed, removed (diff), error |
| `--status-warning` | `#f0c040` | Modified (diff), warning, in-progress |
| `--status-info` | `#6cb4ee` | Queued, informational |
| `--status-neutral` | `#5a5a65` | Unchanged (diff), disabled |

#### Borders
| Token | Hex | Usage |
|---|---|---|
| `--border-default` | `#1f1f24` | Subtle dividers (between sidebar and content, between cards) |
| `--border-strong` | `#2a2a30` | Pronounced borders (card outlines, input borders) |
| `--border-focus` | `#7c6aef` | Focus rings |
| `--border-interactive` | `#2f2f36` | Interactive borders on hover |

### 1.2 Typography

**Font stack:**
```
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", ui-monospace, monospace;
```

| Role | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| Page title (h1) | 20px | 600 | 28px | -0.02em |
| Section heading (h2) | 14px | 600 | 20px | -0.01em |
| Body | 13px | 400 | 20px | 0 |
| Body strong | 13px | 500 | 20px | 0 |
| Caption / metadata | 11px | 400 | 16px | 0.01em |
| Overline / section label | 11px | 500 | 16px | 0.06em (uppercase) |
| Mono (terminal, code) | 13px | 400 | 18px | 0 |
| Mono small | 11px | 400 | 16px | 0 |

### 1.3 Spacing Scale

Base unit: 4px

| Token | Value | Common use |
|---|---|---|
| `--space-1` | 4px | Tight gaps (icon to label) |
| `--space-2` | 8px | Inline spacing, small padding |
| `--space-3` | 12px | Card padding, nav item padding |
| `--space-4` | 16px | Section padding, component gaps |
| `--space-5` | 20px | View padding |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Large section gaps |
| `--space-10` | 40px | Page-level spacing |

### 1.4 Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Badges, small chips |
| `--radius-md` | 6px | Buttons, inputs, cards |
| `--radius-lg` | 8px | Modals, large cards |
| `--radius-xl` | 12px | Panels, popovers |
| `--radius-full` | 9999px | Pills, circular icons |

### 1.5 Shadows / Elevation

Shadows are subtle -- tinted dark, not gray. Used sparingly.

| Level | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Dropdowns, small popovers |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Modals, floating panels |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Command palette, large overlays |
| `--shadow-inset` | `inset 0 1px 2px rgba(0,0,0,0.2)` | Recessed inputs |

### 1.6 Focus Ring

All interactive elements use a consistent focus ring:
```css
outline: 2px solid var(--border-focus);
outline-offset: 2px;
```

On darker backgrounds where the accent ring has low contrast, add a box-shadow halo:
```css
box-shadow: 0 0 0 4px rgba(124, 106, 239, 0.2);
```

Focus rings only appear on `:focus-visible` (keyboard navigation), not on mouse click.

### 1.7 Transitions

| Token | Value | Usage |
|---|---|---|
| `--transition-fast` | `120ms ease-out` | Color changes, opacity |
| `--transition-normal` | `200ms ease-out` | Layout shifts, transforms, hover states |
| `--transition-slow` | `300ms ease-out` | Panel open/close, expand/collapse |

---

## 2. Component Specifications

### 2.1 Sidebar

The sidebar is the primary navigation and context-switching surface.

**Dimensions:**
- Width: `220px` (fixed, not resizable)
- Full height of window (minus title bar, minus status bar)
- Background: `--bg-surface`
- Border-right: `1px solid var(--border-default)`

**Title area:**
- Padding: `16px 12px`
- Border-bottom: `1px solid var(--border-default)`
- Logo/title: "Phantom" -- 15px, weight 600, `--text-primary`

**Navigation section:**
- Padding: `8px 0`
- Each nav item:
  - Height: `32px`
  - Padding: `0 12px`
  - Font: 13px, weight 400
  - Display: flex, align-items: center, gap: 8px
  - Icon: 16px monospace character or 16x16 SVG, `--text-tertiary`
  - **Default:** color `--text-secondary`, background transparent
  - **Hover:** color `--text-primary`, background `--accent-subtle`
  - **Active (current route):** color `--accent`, background `--accent-muted`, left border `2px solid var(--accent)` inset
  - **Focus-visible:** standard focus ring
  - Transition: `--transition-fast` on color and background

**Branch list section:**
- Positioned at bottom of sidebar, pushed down with `margin-top: auto`
- Border-top: `1px solid var(--border-default)`
- Padding: `12px`
- Section label: "BRANCHES" -- overline style (11px, weight 500, uppercase, letter-spacing 0.06em, `--text-tertiary`)
- Margin below label: `8px`
- Each branch item:
  - Height: `28px`
  - Padding: `0 8px`
  - Font: 12px mono, weight 400
  - Border-radius: `--radius-sm`
  - **Default:** `--text-secondary`
  - **Hover:** `--text-primary`, background `--accent-subtle`
  - **Selected (active branch):** `--text-primary`, background `--accent-muted`
  - **Current branch indicator:** small dot (6px circle, `--status-success`) before the name
- Scrollable if many branches (overflow-y: auto, thin scrollbar)

**New Session button:**
- Positioned above branch list
- Full width minus padding (12px sides)
- Height: `32px`
- Border: `1px dashed var(--border-strong)`
- Border-radius: `--radius-md`
- Color: `--text-tertiary`
- Font: 13px, weight 400
- Text: "+ New Session"
- **Hover:** border-color `--accent`, color `--accent`, background `--accent-subtle`

---

### 2.2 Dashboard Card (Analysis Card)

Used in the analysis dashboard grid. Each preset gets one card.

**Dimensions:**
- Min-width: `280px`
- Padding: `16px`
- Border-radius: `--radius-lg`
- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`

**Hover:** border-color `--border-interactive`, box-shadow `--shadow-sm`
**Transition:** `--transition-normal` on border and shadow

**Layout (vertical stack):**

1. **Header row** (flex, space-between, align-center):
   - Left: preset icon (20x20, `--text-tertiary`) + preset name (14px, weight 600, `--text-primary`)
   - Right: status badge

2. **Status badge:**
   - Padding: `2px 8px`
   - Border-radius: `--radius-full`
   - Font: 11px, weight 500
   - Variants:
     - **Queued:** background `rgba(108, 180, 238, 0.12)`, color `--status-info`
     - **Running:** background `rgba(240, 192, 64, 0.12)`, color `--status-warning`, with a subtle pulse animation (opacity 0.6 to 1.0, 1.5s ease-in-out infinite)
     - **Completed:** background `rgba(61, 214, 140, 0.12)`, color `--status-success`
     - **Failed:** background `rgba(242, 95, 92, 0.12)`, color `--status-error`

3. **Timestamp** (below header):
   - Margin-top: `8px`
   - Font: caption style (11px, `--text-tertiary`)
   - Text: "Last run 3 min ago" or "Never run"

4. **Progress bar** (visible when status = running):
   - Margin-top: `12px`
   - Height: `2px`
   - Background: `--border-default`
   - Fill: `--accent` with an indeterminate shimmer animation (CSS gradient moving left to right, 1.5s linear infinite)
   - Border-radius: `--radius-full`

5. **Findings summary** (visible when completed):
   - Margin-top: `12px`
   - Max 3 lines, text-overflow ellipsis
   - Font: 13px, `--text-secondary`

6. **Diff summary** (visible on branch views):
   - Margin-top: `8px`
   - Small inline badges: "+3 new" (green), "-1 removed" (red), "~2 modified" (yellow)
   - Badge style: same as status badge but smaller (10px font)

7. **Action buttons** (footer row):
   - Margin-top: `16px`
   - Padding-top: `12px`
   - Border-top: `1px solid var(--border-default)`
   - Buttons: "View" (primary ghost), "Rerun" (ghost), "Cancel" (ghost, only when running)
   - Button style:
     - Height: `28px`
     - Padding: `0 10px`
     - Font: 12px, weight 500
     - Border-radius: `--radius-md`
     - **Ghost default:** color `--text-secondary`, background transparent
     - **Ghost hover:** color `--text-primary`, background `--bg-elevated`
     - **Primary ghost default:** color `--accent`
     - **Primary ghost hover:** color `--accent-hover`, background `--accent-subtle`
     - **Disabled:** opacity 0.4, pointer-events none

---

### 2.3 Diagram Node (React Flow Custom Node)

Each node in the React Flow diagram canvas.

**Base dimensions:**
- Min-width: `140px`
- Max-width: `240px`
- Padding: `10px 14px`
- Border-radius: `--radius-md`
- Background: `--bg-surface`
- Border: `1.5px solid var(--border-strong)`
- Font: 13px, weight 500, `--text-primary`

**States:**
- **Default:** as above
- **Hover:** border-color `--accent`, box-shadow `0 0 0 3px rgba(124, 106, 239, 0.15)`, cursor pointer
- **Selected:** border-color `--accent`, background `--accent-muted`, box-shadow `0 0 0 3px rgba(124, 106, 239, 0.25)`
- **Focus-visible:** standard focus ring

**Diff color variants (border-left 3px solid):**
- **New (green):** border-left `3px solid var(--status-success)`, subtle green tint on background `rgba(61, 214, 140, 0.06)`
- **Removed (red):** border-left `3px solid var(--status-error)`, subtle red tint `rgba(242, 95, 92, 0.06)`, diagonal hatch overlay at 5% opacity
- **Modified (yellow):** border-left `3px solid var(--status-warning)`, subtle yellow tint `rgba(240, 192, 64, 0.06)`
- **Unchanged:** no colored border-left, border-color `--border-default`

**Node type sub-label:**
- Below the main label
- Font: caption style (11px, `--text-tertiary`)
- Text: "service", "module", "function", etc.

**Drill-down indicator:**
- If node has children, show a small chevron-right icon (10px, `--text-tertiary`) at the right edge
- On hover, icon color `--accent`

**Edges:**
- Stroke: `var(--border-strong)`, width 1.5px
- Animated dashes for "running" analysis connections
- Edge labels: 11px mono, `--text-tertiary`, background `--bg-base` padding 2px 4px for readability
- Diff-colored edges follow the same green/red/yellow scheme with matching stroke colors

---

### 2.4 Breadcrumb

Navigation trail above the diagram canvas.

**Container:**
- Height: `36px`
- Padding: `0 16px`
- Display: flex, align-items: center
- Background: `--bg-surface`
- Border-bottom: `1px solid var(--border-default)`

**Segments:**
- Font: 13px, weight 400
- Color: `--text-secondary`
- Clickable segments: cursor pointer
- **Hover:** color `--text-primary`, text-decoration underline (underline-offset 2px)
- **Current (last segment):** color `--text-primary`, weight 500, not clickable

**Separator:**
- Character: `/` or chevron-right SVG (10px)
- Color: `--text-tertiary`
- Margin: `0 6px`

**Truncation:**
- If more than 4 segments, collapse middle segments into "..." menu
- "..." is clickable, shows a dropdown with the hidden segments
- Dropdown style: background `--bg-overlay`, border `1px solid var(--border-strong)`, border-radius `--radius-md`, shadow `--shadow-sm`

---

### 2.5 Terminal Tab Bar

Tab bar within each terminal split pane.

**Container:**
- Height: `34px`
- Background: `--bg-surface`
- Border-bottom: `1px solid var(--border-default)`
- Display: flex, align-items: stretch
- Overflow-x: auto (scroll horizontally for many tabs), scrollbar hidden (CSS)

**Individual tab:**
- Min-width: `100px`
- Max-width: `180px`
- Padding: `0 12px`
- Display: flex, align-items: center, gap: 6px
- Font: 12px mono, weight 400
- Border-right: `1px solid var(--border-default)`
- Flex-shrink: 0

**Tab states:**
- **Default:** color `--text-secondary`, background `--bg-surface`
- **Hover:** color `--text-primary`, background `--bg-elevated`
- **Active:** color `--text-primary`, background `--bg-base`, border-bottom: `2px solid var(--accent)` (overlapping the container's border-bottom to create a "connected" effect)
- Transition: `--transition-fast`

**Tab title:**
- Truncate with ellipsis if too long
- Shows session name or "zsh", "bash", "claude", etc.

**Close button (per tab):**
- Size: `16px` square
- Icon: small "x" (10px)
- Color: `--text-tertiary`
- Visible only on tab hover or when tab is active
- **Hover:** color `--text-primary`, background `rgba(255,255,255,0.08)`, border-radius `--radius-sm`

**Add tab button:**
- Positioned after last tab
- Size: `34px` square (same height as bar)
- Icon: "+" (12px, `--text-tertiary`)
- **Hover:** color `--accent`, background `--accent-subtle`

---

### 2.6 Split Divider

Draggable divider between terminal split panes.

**Dimensions:**
- Visual width: `1px` (rendered as a border/pseudo-element)
- Grab area: `6px` wide (invisible hit zone centered on the 1px line)
- For horizontal splits: height `1px`, grab area `6px` tall

**States:**
- **Default:** color `--border-default`, cursor `col-resize` (or `row-resize` for horizontal)
- **Hover:** color `--border-interactive`, width expands to `2px`
- **Dragging:** color `--accent`, width `2px`, cursor `col-resize`
- Transition: `--transition-fast` on color and width

**Constraints:**
- Minimum pane size: `120px` wide, `80px` tall
- Divider snaps to edges if dragged past minimum (collapses pane)

---

### 2.7 Status Bar

Global bar at the bottom of the window.

**Dimensions:**
- Height: `28px`
- Width: `100%` (full window width)
- Background: `--bg-surface`
- Border-top: `1px solid var(--border-default)`
- Padding: `0 12px`
- Display: flex, align-items: center, justify-content: space-between

**Left section (flex, gap: 12px):**
- **Branch indicator:**
  - Small git-branch icon (12px, `--text-tertiary`)
  - Branch name: 11px mono, weight 500, `--text-primary`
  - Clickable: hover color `--accent`

- **Running jobs count:**
  - Spinner icon (12px, `--status-warning`, spinning 1s linear infinite) -- only visible when jobs > 0
  - Text: "2 jobs" -- 11px, `--text-secondary`

**Right section (flex, gap: 12px):**
- **Session count:**
  - Terminal icon (12px, `--text-tertiary`)
  - Text: "3 sessions" -- 11px, `--text-secondary`

- **Quick actions:**
  - Small icon buttons (20px square, `--text-tertiary`)
  - **Hover:** color `--text-primary`, background `--bg-elevated`, border-radius `--radius-sm`

**Badge style (for counts > 0):**
- Inline, no special container
- Font: 11px mono
- Color: `--text-secondary`

---

### 2.8 Preset Card (CLI Launcher)

Card in the CLI session launcher view.

**Dimensions:**
- Width: `100%` (fills grid column)
- Padding: `16px`
- Border-radius: `--radius-lg`
- Background: `--bg-surface`
- Border: `1px solid var(--border-default)`

**Layout:**

1. **Header (flex, align-center, gap: 10px):**
   - CLI icon (20x20, color per CLI type):
     - Claude: `--accent` (purple)
     - Codex: `--status-info` (blue)
     - Cursor: `--status-success` (green)
     - Shell: `--text-secondary` (gray)
   - Name: 14px, weight 600, `--text-primary`
   - CLI binary name: 11px mono, `--text-tertiary`, in parentheses

2. **Flags display:**
   - Margin-top: `8px`
   - Background: `--bg-inset`
   - Padding: `6px 10px`
   - Border-radius: `--radius-sm`
   - Font: 12px mono, `--text-secondary`
   - Text: `--model opus --verbose`
   - Max 2 lines, overflow ellipsis

3. **Working directory (if set):**
   - Margin-top: `6px`
   - Font: 11px, `--text-tertiary`
   - Text: "~/projects/myapp"

4. **Launch button:**
   - Margin-top: `12px`
   - Full width
   - Height: `32px`
   - Background: `--accent`
   - Color: `--text-inverse`
   - Font: 13px, weight 500
   - Border-radius: `--radius-md`
   - **Hover:** background `--accent-hover`
   - **Active:** scale(0.98), transition 60ms
   - **Focus-visible:** standard focus ring
   - Text: "Launch"

**Card hover:** border-color `--border-interactive`

---

### 2.9 Custom Analysis Editor

Modal or inline editor for creating custom analysis presets.

**Container:**
- Padding: `20px`
- Background: `--bg-surface`
- Border-radius: `--radius-lg`
- Border: `1px solid var(--border-strong)`

**Fields:**

1. **Name input:**
   - Height: `32px`
   - Width: `100%`
   - Padding: `0 10px`
   - Background: `--bg-inset`
   - Border: `1px solid var(--border-strong)`
   - Border-radius: `--radius-md`
   - Font: 13px, `--text-primary`
   - Placeholder color: `--text-tertiary`
   - **Focus:** border-color `--accent`, box-shadow `--shadow-inset`, `0 0 0 3px rgba(124, 106, 239, 0.15)`
   - Transition: `--transition-fast`

2. **Prompt textarea:**
   - Width: `100%`
   - Min-height: `160px`
   - Padding: `10px`
   - Background: `--bg-inset`
   - Border: `1px solid var(--border-strong)`
   - Border-radius: `--radius-md`
   - Font: 13px mono, `--text-primary`, line-height 20px
   - Resize: vertical only
   - **Focus:** same as name input
   - Placeholder: "Describe what you want to analyze..." in `--text-tertiary`

3. **Schedule picker:**
   - Margin-top: `12px`
   - Label: "Schedule" -- overline style
   - Radio group or segmented control:
     - Options: "Manual", "On main change", "Periodic"
     - Segmented control style:
       - Background: `--bg-inset`
       - Border-radius: `--radius-md`
       - Each segment: padding `6px 12px`, font 12px weight 500
       - **Default:** color `--text-secondary`
       - **Selected:** background `--bg-elevated`, color `--text-primary`, box-shadow `--shadow-sm`
       - Transition: `--transition-normal`
   - Periodic sub-option: interval input (number + "hours" label), same style as name input but width `80px`

4. **Action buttons (flex, gap: 8px, justify: flex-end):**
   - "Cancel" -- ghost button style (see Dashboard Card actions)
   - "Create" -- primary button style (same as Launch button in Preset Card)
   - Both height `32px`

---

## 3. Layout Specifications

### 3.1 Overall Window Layout

```
+----------------------------------------------------------+
|  Title Bar                            [- ] [[] ] [ x ]   |  <- OS-native or Tauri custom, height 0 (borderless) or ~30px
+--------+-------------------------------------------------+
|        |                                                 |
|  220px |              flex: 1                            |
|        |                                                 |
| Sidebar|         Main Content Area                       |
|        |                                                 |
|        |     (routed: Terminal / Dashboard / Diagrams    |
|        |      / Launcher)                                |
|        |                                                 |
+--------+-------------------------------------------------+
|               Status Bar (28px)                          |
+----------------------------------------------------------+
```

- Window minimum size: `900px` wide x `600px` tall
- Sidebar: fixed `220px` wide
- Content area: `calc(100% - 220px)` wide, `calc(100% - 28px)` tall (minus status bar)
- Status bar: full width, `28px` tall, fixed at bottom

### 3.2 Dashboard Grid

**Container:**
- Padding: `20px`
- Overflow-y: auto

**Grid:**
- Display: grid
- `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- Gap: `16px`

**Responsive behavior:**
- At content width >= 900px: 3 columns
- At content width >= 600px: 2 columns
- At content width < 600px: 1 column

**Empty state:**
- Centered vertically and horizontally
- Icon: 48px, `--text-tertiary`
- Heading: "No analyses yet" -- h2 style
- Subtext: "Configure presets to get started" -- body, `--text-secondary`
- CTA button: "Create Analysis" -- primary button style

### 3.3 Diagram Viewer

```
+--------------------------------------------------+
|  Breadcrumb bar (36px)                            |
+--------+-----------------------------------------+
| Tool-  |                                         |
| bar    |        React Flow Canvas                |
| (40px) |        (fills remaining space)           |
|        |                                         |
|  Zoom  |    [nodes and edges here]               |
|  Fit   |                                         |
|  Export |                            [Minimap]    |
|        |                                         |
+--------+-----------------------------------------+
```

- **Breadcrumb bar:** `36px` tall, full width, as specified in 2.4
- **Toolbar:** `40px` wide, left side, vertical button stack
  - Background: `--bg-surface`
  - Border-right: `1px solid var(--border-default)`
  - Buttons: `32px` square, centered in toolbar
  - Icon: 16px, `--text-secondary`
  - **Hover:** color `--text-primary`, background `--bg-elevated`
  - **Active (e.g., selected tool):** color `--accent`, background `--accent-muted`
  - Buttons: Zoom In, Zoom Out, Fit View, Toggle Diff, Export
  - Divider between groups: `1px solid var(--border-default)`, margin `4px 0`
- **Canvas area:** fills remaining space, background `--bg-base`
- **Minimap:** React Flow's built-in minimap, positioned bottom-right, 120x80px
  - Background: `--bg-surface` at 80% opacity
  - Node fill: `--border-strong`
  - Border: `1px solid var(--border-default)`
  - Border-radius: `--radius-md`

### 3.4 Terminal View

```
+--------------------------------------------------+
|  Tab Bar (34px)              [+]                  |
+--------------------------------------------------+
|                                                   |
|           Terminal Canvas                         |
|           (fills remaining space)                 |
|                                                   |
+--------------------------------------------------+
```

For splits:

```
+--------------------------------------------------+
|  Tab Bar (34px)    [+]  |  Tab Bar (34px)    [+] |
+--------------------------+------------------------+
|                         |                        |
|   Terminal A            |   Terminal B            |
|                         |                        |
|                         |                        |
+--------------------------+------------------------+
```

- **Tab bar:** as specified in 2.5, per pane
- **Split divider:** as specified in 2.6
- **Terminal canvas:** SolidJS island, black background (`#000`), fills all remaining space
- **Minimum split pane width:** `120px`
- **Minimum split pane height:** `80px`
- **Default split ratio:** 50/50

### 3.5 Launcher View

```
+--------------------------------------------------+
|  "AI Sessions" (h1)        [+ New Preset]        |
|                                                   |
|  +----------+  +----------+  +----------+        |
|  |  Preset  |  |  Preset  |  |  Preset  |        |
|  |  Card    |  |  Card    |  |  Card    |        |
|  |          |  |          |  |          |        |
|  | [Launch] |  | [Launch] |  | [Launch] |        |
|  +----------+  +----------+  +----------+        |
|                                                   |
+--------------------------------------------------+
```

- **Header:** flex, space-between, align-center, padding `20px`
- **Title:** h1 style (20px, weight 600)
- **New Preset button:** ghost button with "+" icon, accent colored
- **Grid:** same grid pattern as dashboard (`repeat(auto-fill, minmax(260px, 1fr))`, gap `16px`)
- **Container padding:** `0 20px 20px 20px`

---

## 4. Interaction Patterns

### 4.1 Scrollbars

Thin, auto-hiding scrollbars everywhere:
```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
```

### 4.2 Loading States

- Skeleton loaders for cards: pulsing `--bg-elevated` to `--bg-surface` gradient, 1.5s ease-in-out infinite
- Inline spinners: 14px circle, `--accent`, 2px border, rotating 0.8s linear infinite
- Progress bars (indeterminate): see Dashboard Card progress bar spec

### 4.3 Empty States

All views have a meaningful empty state with:
- A muted icon or illustration (line-art style, `--text-tertiary`)
- A heading explaining the state
- A subtext with guidance
- An actionable CTA button

### 4.4 Keyboard Navigation

- Tab order follows visual layout: sidebar nav items -> main content
- Arrow keys navigate within component groups (nav items, tab bar, grid cells)
- Escape closes modals, dropdowns, cancels editing
- All keyboard shortcuts displayed in tooltips (delayed 500ms)

### 4.5 Tooltip Style

- Background: `--bg-overlay`
- Border: `1px solid var(--border-strong)`
- Border-radius: `--radius-md`
- Shadow: `--shadow-sm`
- Padding: `4px 8px`
- Font: 12px, `--text-primary`
- Max-width: `240px`
- Arrow: 6px, matching background
- Delay: 500ms appear, 0ms disappear
- Transition: opacity `--transition-fast`
