# App Icon Prompt

Generate to: `crates/phantom-app/icons/` (32x32, 128x128, 128x128@2x, icon.icns)

---

## Prompt

Design a macOS app icon for "Phantom" — an AI-powered development workspace that combines a terminal emulator, code analysis dashboard, and architecture diagram viewer.

**Concept:** A single, refined glyph that evokes the feeling of a phantom — something present but not fully visible, a quiet intelligence working in the background. The icon should feel like it belongs next to Warp, Raycast, or Linear in someone's dock.

**Visual direction:**

- A minimal, slightly abstracted terminal cursor or command prompt shape — but softened and made ethereal. Think of a `>_` prompt that's dissolving at its edges, or a monogram "P" that has the cadence of a blinking cursor.
- Alternatively: a subtle, geometric ghost/specter silhouette — not cartoonish, not literal. More like a hood or cloak shape formed from negative space, with a single glowing accent that suggests awareness. Think of the way Figma's icon is just a few geometric shapes that imply a pen tool — that level of abstraction.
- The shape should feel like it's emerging from or fading into darkness. Partial transparency, soft luminous edges, volumetric glow — as if the icon itself is a phantom materializing.

**Color:**

- Primary: deep matte black or near-black (#09090b to #111113) background within the icon's rounded-rect shape.
- Accent: a single, restrained purple glow (#7c6aef) — used sparingly. Not neon. More like bioluminescence or a distant star. The accent should feel like it's lighting the form from within, not painted on top.
- Optionally, a very subtle cool-gray gradient on the glyph itself to give it depth without breaking the monochrome feel.

**Style constraints:**

- macOS Big Sur / Sequoia icon language: rounded super-ellipse (squircle) shape, subtle depth, slight top-down lighting.
- No text, no letters, no words inside the icon.
- No generic AI imagery (no brain, no circuit board, no robot, no sparkles).
- No gradients that look like stock templates. Every gradient should feel intentional and physically motivated (light source, material, depth).
- The icon should read clearly at 16x16 and look stunning at 512x512.
- It should feel like a tool made by someone who cares about craft — quiet confidence, not shouting for attention.

**Mood references:**

- The ambient glow of a terminal in a dark room at 2am
- A cursor blinking in the void, waiting
- The way fog catches a single streetlight
- Obsidian, matte carbon fiber, deep space

**What to avoid:**

- Literal ghosts, skulls, halloween imagery
- Bright colors, busy gradients, multiple accent colors
- Glossy or skeuomorphic finishes
- Anything that looks AI-generated in that "too smooth, too symmetric, suspiciously perfect gradient" way
- Generic developer tool icons (wrench, gear, code brackets)

**Output:** Square icon at 1024x1024, PNG with transparency. The squircle mask will be applied by macOS.
