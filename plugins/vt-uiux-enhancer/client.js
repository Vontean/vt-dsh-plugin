/**
 * dsh-vt-uiux-enhancer — client half.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 * The plugin is layered so that adding another UI fix is a data change, not a
 * code change. Three layers, strictly one-directional:
 *
 *   domain      what we want changed, in our own vocabulary
 *               (tokens, css variables, component targets). No DSH names here
 *               beyond the token/selector strings themselves.
 *   adapters    the anti-corruption layer: translate one domain patch into one
 *               concrete effect on DSH's runtime (Theme service, injected sheet,
 *               CSSOM class discovery). DSH quirks stop here.
 *   engine      owns lifetimes: apply every patch, re-resolve late stylesheets,
 *               dispose everything in reverse order.
 *
 * The seam every patch crosses is a single interface:
 *
 *     apply(patch, ctx) -> () => void        // returns a disposer
 *
 * so a new UI fix is (a) a data entry in the domain section and (b) at most one
 * new adapter function. Nothing else in the file needs to know about it.
 *
 * ── Why this shape ──────────────────────────────────────────────────────────
 * DSH internals are the corrupted side of the seam: CSS-module classes carry
 * per-build hashes, several design tokens are declared on `body, body *` so an
 * inline override cannot reach descendants, and some component geometry is
 * literal with no token at all. The adapters absorb exactly those three quirks;
 * everything above them stays stable when the app updates.
 *
 * ── Design history (kept: it explains the current values) ────────────────────
 *   v1  hue-only rotation of the reference ramp → invisible (ΔE < 3).
 *   v2  dyed the canvas beige while surfaces stayed white → muddy purple-grey.
 *   v3  Notion model: white canvas, warm greys in text and sidebar only.
 *   v4  composer elevation modelled on the local Codex desktop app.
 *   v5  send button aligned with its 28px siblings; glyph weight unified.
 *   v6  layered architecture + runtime selector discovery + diagnostics hook.
 */

window.__ModuleLoader__.load({
  id: 'dsh-vt-uiux-enhancer',
  factory(require) {
    'use strict';

    const PLUGIN_ID = 'dsh-vt-uiux-enhancer';
    const VERSION = '1.2.2';

    /**
     * DSH ships `:root { --dsw-corner-shape: superellipse(1.5) }` and applies it
     * to `*, ::before, ::after`. Corner *shape* decides whether a control renders
     * as a circle or as a squircle; border radius only sets the size. A 999px
     * radius therefore still reads as a rounded square while the shape exponent
     * stays at 1.5 — which is why radius-only overrides looked like no change.
     * `superellipse(1)` is the exponent the app itself uses for the genuinely
     * circular controls (send button, add button); `round` is the standard
     * keyword for the same thing and stays as a fallback.
     */
    const CONTROL_SHAPE = 'corner-shape: round !important;\n  corner-shape: superellipse(1) !important;';

    /**
     * Weight for CJK controls that share a row with Latin values.
     *
     * At the same 13px, an ideograph fills ~85% of the em while Latin lowercase
     * fills ~54% (measured: 11px vs 7px ink height in this app's font stack). A
     * 500 weight that reads as "medium" in Latin therefore reads as "bold" in
     * Chinese. Upstream sets the permission and plan chips to 500 while the model
     * name beside them is 400, so the row reads as two type systems. Dropping the
     * CJK side one step restores one system; the perceived size gap remains (that
     * is the script itself), only the extra weight goes away.
     */
    const CJK_LABEL_WEIGHT = 400;

    // ═══════════════════════════════════════════════════════════════════════
    // DOMAIN — what we want changed. All visual values live here and nowhere
    // else. Token names and rule signatures are the only DSH-specific facts.
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Reference neutral ramp: scheme-neutral, exactly like the shipped one
     * (dark mode gets its depth by pointing aliases at the low-numbered steps).
     *
     * Two temperature bands, and the split is deliberate: **fills are neutral,
     * ink is warm**. Steps 50–200 paint surfaces — hover, selection, secondary
     * buttons — where any warm cast reads as dirty instead of cosy (100 used to
     * be `#f1ede8`, R−B = 9, and that ~8% bias is plainly visible on the
     * settings panel's selected row). Steps 500 and up paint text, where the same
     * slight warmth is what keeps a white canvas from feeling cold. 300/400 sit
     * on the seam as borders, so they keep a token 3 of warmth.
     */
    const WARM_RAMP = {
      '00': '#ffffff',
      '50': '#fafafa',
      '60': '#f7f7f7',
      '75': '#f5f5f5',
      '100': '#f1f1f1',
      '150': '#eeeeee',
      '200': '#e8e8e8',
      '300': '#d5d2d0',
      '400': '#b4b1af',
      '500': '#a09c97',
      '550': '#938f8b',
      '600': '#888480',
      '700': '#686561',
      '750': '#484441',
      '800': '#383633',
      '850': '#2e2c2a',
      '875': '#242322',
      '900': '#1c1b1a',
      '950': '#171513',
      '1000': '#13110d',
    };

    /** Semantic aliases: white canvas, warm-grey text, warm-white sidebar. */
    const ALIAS = {
      '--dsw-alias-bg-base': { light: '#ffffff', dark: '#191918' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#212120' },
      '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#292928' },
      '--dsw-alias-bg-layer-3': { light: '#ffffff', dark: '#31312f' },
      '--dsw-alias-label-primary': { light: '#0d0d0d', dark: '#f5f4f2' },
      '--dsw-alias-label-secondary': { light: '#615d59', dark: '#c2bfbb' },
      '--dsw-alias-label-tertiary': { light: '#7d7873', dark: '#9a9793' },
      '--dsw-alias-label-caption': { light: '#9c9792', dark: '#75726e' },
      '--dsw-specific-sidebar-fill': { light: '#f6f5f4', dark: '#1e1e1d' },
      // Shipped #2631480f is blue (R38 G49 B72); a neutral alpha drops the cast.
      '--dsw-alias-interactive-bg-hover': { light: '#0000000d', dark: '#ffffff14' },
    };

    /**
     * The queued-message panel above the composer.
     *
     * It is not a popover, but it borrows the popover material: its `::before`
     * paints `var(--dsw-specific-menu)`, the very token the menu-surface patch
     * pushes to near-white. So the panel lost its surface and kept only the
     * hairline — it read as white on white. One step of grey puts it back above
     * the canvas instead of inside it.
     *
     * Dark keeps the material value: there the panel already contrasts with the
     * composer card, and a darker fill would sink it into the page.
     */
    const QUEUE_FILL = { light: '#f5f5f5', dark: '#232324f5' };

    /**
     * Turn rail ("piano") — the vertical strip of turn marks beside the
     * transcript, used to jump between turns.
     *
     * Transcribed from the local Codex desktop build
     * (`ChatGPT.app/Contents/Resources/app.asar` →
     * `webview/assets/thread-user-message-navigation-rail`, module CSS
     * `k7ebw`), because "like Codex" has to mean numbers, not a vibe:
     *
     *   bar     26px long, 2px tall, square ends, grown from the LEFT edge by
     *           `transform: scaleX` — rest length 6px (x .2308), so the rail is
     *           a row of ticks at rest, not a column of dashes
     *   wave    hovered bar 26px, neighbours 20/14/10px (x .7/.4/.2), animated
     *           over 160ms with a slight-overshoot `linear()` curve; the whole
     *           wave snaps (0ms) while the pointer is scrubbing
     *   row     10px pitch, 36px hit area, 12px in from the pane edge, vertically
     *           centred, internally scrollable with masked fades at both ends
     *   preview 320px card on the side away from the rail, 8px padding, 12px
     *           radius, hairline ring, 13/18 prompt over 12/18 clamped response
     *
     * Values are kept in pixels and converted to `scaleX` in one place
     * (`railScale`), because every state expresses a *length*; a bare ratio
     * hides why the numbers differ.
     */
    const RAIL = {
      left: 12,
      width: 36,
      bar: 26,
      rest: 6,
      /** The turn in view: between rest and hover so the eye can find it. */
      active: 10,
      /** Wave plateaus for the neighbours at ±1, ±2, ±3. */
      neighbors: [20, 14, 10],
      radius: 1,
      gap: 8,
      previewWidth: 320,
      previewPadding: '8px 10px',
      previewRadius: 12,
      previewMaxHeight: 128,
      /** Preview travel per hovered row; Codex anchors per row, we glide. */
      glideMs: 100,
      springMs: 160,
    };

    /**
     * The composer's leading "+" and its glyph.
     *
     * The shipped button is a filled 28px plate (`--dsw-specific-selector`) with a
     * 14px glyph whose arms span 11px at stroke 1.3. Measured against the rest of
     * the row — mic 7x10 ink at 1px, permission icon 10x11 at 1px, send 9x9 at
     * 1.5 — an 11x11 plus becomes the heaviest glyph in the row the moment the
     * plate that used to justify it is removed.
     *
     * 13px box scales the 14-unit artwork by .93: arms 10.2px, and a 1.5 stroke
     * renders at 1.39px, i.e. between the mic and the send arrow.
     */
    const ADD_GLYPH = { size: 13, stroke: 1.5 };

    /**
     * How far the "+" is pulled toward the permission chip.
     *
     * The row's rhythm is 12px box-to-box, and that is right everywhere except
     * here: the plus is a 13px glyph centred in a 28px hit box (7.5px of empty on
     * each side), while the chip starts with 8px of its own padding before its
     * shield glyph. Boxes 12px apart therefore read as ~27px between the two
     * glyphs, i.e. the left cluster looks split in two.
     *
     * The pull is a *visual* gap: 8px leaves 4px between the boxes (12 - 8), which
     * is where the two glyphs sit ~19px apart — tight enough to read as one
     * cluster, loose enough that the hover plates still do not touch.
     */
    const ADD_PULL = 8;

    /**
     * Transcript edge fade.
     *
     * 24px, not 40: this is a hint that the list continues, not a mask that hides
     * content. The app's own scroll panels fade over 24px (`_fadeTop` /
     * `_fadeBottom` in the chat and trajectory modules), so 24px is the house
     * size; a band only appears on the side that has content beyond it.
     */
    const EDGE_FADE = { size: 24, settleMs: 140 };

    /**
     * The conversation header's second row: view tabs (对话 / 轨迹 / …).
     *
     * Hiding that row is easy; hiding it *without* changing the app is not. It is
     * also a layout input: React derives how many tabs fit from the row's own
     * `clientWidth`, and moves the rest into the "…" menu, which unmounts their
     * buttons. `display:none` measures 0, so 轨迹 left the DOM entirely —
     * measured, not guessed. Hence zero height with the width intact.
     *
     * Giving the height back is the other half. The shipped
     * `.header:where(:not(:has(.tabs)))` states the no-tab geometry —
     * `min-height: 0` plus 10px of bottom padding — but the element stays in the
     * tree, so `:has()` keeps matching and that rule never fires. The header
     * would stay at 76px with ~36px of empty band under the title. Restating the
     * same numbers is the only way to buy the shipped look back: 10 padding-top
     * + 30 title row + 10 padding-bottom, which measures 51px.
     *
     * The separator is not ours to draw: it is `.header`'s own
     * `border-bottom: .5px` — the tab row never owned it.
     */
    const VIEW_TABS = { headerBottom: 10 };

    /**
     * 「轨迹」entry in the composer's status row.
     *
     * That row is the official `conversation.composer.dock` list slot; both
     * shipped items (turn/step counts, token usage) are registered into it, and
     * so is this one — order -1 puts it first, since upstream uses 0 and 1.
     *
     * Its look is borrowed, not copied: the signature finds the chat package's
     * own pill class, and anchor/label come from the same CSS-module family. A
     * local copy of the font size, the 6px icon gap and the 1px/8px padding
     * would drift with the theme tokens and with every DSH release; sharing the
     * classes means it cannot.
     */
    const VIEW_SWITCH = {
      id: 'vt-view-switch',
      order: -1,
      signature: ['display:inline-flex', 'white-space:nowrap', 'gap:6px', 'padding:1px8px'],
      selectorFilter: '_pill$',
      fallback: '.TQ0rwa_pill',
      /** The label follows the view; recomputing faster than the eye buys nothing. */
      settleMs: 150,
      /**
       * Icon box and stroke. 14px is what `.pill svg` already forces on its
       * children, so the entry matches its neighbours without a rule of its own;
       * 1 is the icon set's regular stroke, which renders at 14/16 of a unit.
       * Both live here rather than in the behaviour, because they are the two
       * numbers to revisit together if the entry ever changes size (trap 8).
       */
      glyph: { box: 14, stroke: 1 },
    };

    /**
     * Glyphs, transcribed from the app's own icon set
     * (`@deepseek-ai/dsh-client-ui-primitives`: 16-unit art, stroke 1,
     * `currentColor`). One is not enough — the entry is bidirectional, pointing
     * at 轨迹 from the conversation and back at 对话 from the trajectory, and a
     * list glyph meaning "go to the conversation" would be a lie.
     *
     * The `<svg>` box is 14px, matching `.pill svg{width:14px}`, so the stroke
     * lands at 14/16 of one unit exactly like every neighbouring icon.
     */
    const VIEW_SWITCH_GLYPH = {
      /** IconFlatList — three rows, three dots: one line per record. */
      toTrajectory: ['M6 3.5h7.5M6 8h7.5M6 12.5h7.5', 'M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01'],
      /** IconChevronLeft — the return trip, drawn as the gesture. */
      toConversation: ['M10 4L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12'],
    };

    /**
     * Long user messages in the transcript.
     *
     * A pasted stack trace turns one turn into four screenfuls and pushes every
     * later exchange out of reach. Codex clamps the message and offers a
     * disclosure; this copies that, with one difference that matters for a
     * responsive layout: the threshold is RENDERED ROWS, never characters.
     * Twenty rows means twenty rows at any column width and any content font
     * size, because the count is measured from the bubble the browser laid out;
     * a character budget would show 9 lines in a narrow window and 40 in a wide
     * one, which is exactly the scrolling problem this is meant to solve.
     *
     * The reference this was modelled on (Codex) spends all twenty rows: the
     * nineteenth is the last line of text, the twentieth is a lone "…" that says
     * "there is more", and the disclosure row sits under it inside the same
     * fill. Expanded, the text runs to the bottom and only the disclosure row is
     * left.
     *
     * Geometry is expressed against the bubble's own line box
     * (`line-height: calc(22px + var(--dsh-content-font-delta))` — the second
     * term is the Appearance content-size preference), so the clamp follows the
     * font setting through CSS `calc()` and the line count never has to be
     * recomputed. `padding` mirrors the shipped bubble (`10px 16px`) and
     * `stackGap` the shipped `.userStack` gap; the two extra rows are a SIBLING
     * of the bubble, because `overflow: hidden` clips at the padding box
     * (see trap 10 in DEVELOPMENT.md).
     */
    const MESSAGE_CLAMP = {
      /**
       * Rows shown while clamped, the "…" marker included. Twenty is where a
       * message stops reading as a message and starts reading as a document;
       * below it nothing changes at all.
       */
      rows: 20,
      /** Space between the "…" row and the disclosure row. */
      rowGap: 8,
      /** The shipped bubble's bottom/side padding, and the stack gap it sits in. */
      padding: { bottom: 10, x: 16 },
      stackGap: 8,
      /** Gap between the last text line and the disclosure block when expanded. */
      textGap: 4,
      /** Chevron: the icon set's own default box; regular stroke is 1 at 16. */
      glyph: { box: 14, stroke: 1 },
      /** Icon-to-label gap, the value the app's disclosure titles use. */
      iconGap: 6,
    };

    /**
     * Reading position while an answer streams.
     *
     * The transcript follows the tail: every frame that grows the answer scrolls
     * one line further, so a long answer walks its own first paragraph out of the
     * viewport and the reader has to scroll back to the beginning of the text
     * they are being shown.
     *
     * The fix freezes the position when the answer starts, and the offset below is
     * the only alignment line it may still use: when the answer's first line is not
     * on screen at that moment (a long process group pushed it below the fold), the
     * view moves once so the answer starts there. Measured between two box edges,
     * never from a token; the chat column's own `padding-top` is 16px, so 20px
     * leaves 4px of air above the text without looking clipped.
     */
    const SCROLL_PIN = {
      /**
       * The pin line is not invented: it is the distance DSH itself leaves between
       * the scrollport's top edge and its content — the chat list's own
       * `padding-top` (`.scroll { padding: 16px … }` in the chat view's CSS). That
       * is exactly where the first user bubble sits in a fresh session, so "pinned"
       * here means the same thing the shipped layout already calls the top.
       *
       * Read at runtime (`offsetOf`), because a token or a hard-coded number would
       * drift the moment upstream touches that padding. This value is the fallback
       * for a list that cannot be measured yet.
       */
      fallbackOffset: 16,
      /**
       * Bottom slack when deciding whether the answer's first line survives the
       * pin: a line that only half-fits is not "visible". One line box (22px) is
       * the smallest honest margin.
       */
      slack: 24,
    };

    /** Codex's spring: linear() with a 0.8% overshoot instead of a bezier. */
    const RAIL_SPRING = 'linear(0, .398 10%, .682 20%, .843 30%, .925 40%, .972 50%, 1.004 60%, 1.008 70%, 1.003 80%, 1)';

    /** Bar length in px → the scaleX that produces it (0.2308 … 1). */
    const railScale = (px) => String(+(px / RAIL.bar).toFixed(4));

    /**
     * PATCHES — the domain's registry. Adding a UI fix means adding an entry
     * here; the engine and adapters stay untouched.
     *
     * kind: 'tokens'    → Theme service override layer (light/dark pairs).
     * kind: 'variables' → redeclare CSS custom properties on every element that
     *                     carries them, for tokens DSH declares on `body, body *`.
     * kind: 'component' → CSS rules for a target resolved by signature.
     */

    // ── Patch constructors ──────────────────────────────────────────────────
    // Pure selector mechanics. Two of them, both used while *defining* patches,
    // both free of DSH state: they take a string and return a string. They live
    // above `PATCHES` so that the data section never reaches downward into the
    // adapter section for a helper — the dependency arrow stays one-directional.
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Companion class from the same CSS-module family.
     *
     * Classes generated by one module share a prefix (`.pn0E2q_trigger`,
     * `.pn0E2q_roundButton`), so a second state of the same control can be reached
     * by swapping only the suffix — which stays hash-adaptive. The tempting
     * `[class*="roundButton"]` instead matches every unrelated component whose
     * class happens to contain those words, and silently restyles them.
     */
    function moduleSibling(selector, suffix) {
      const first = String(selector || '').split(',')[0].trim();
      const cut = first.lastIndexOf('_');
      if (!first.startsWith('.') || cut < 0) return '';
      return `${first.slice(0, cut)}_${suffix}`;
    }

    /**
     * A dialog portalled to <body> and placed by `useAnchoredPosition`.
     *
     * That primitive only knows `align: 'start' | 'end'` — there is no centred
     * option — and the panels above pass neither, so `left` lands on the
     * trigger's left edge and a wide panel over a narrow trigger reads as
     * hanging off to the right.
     *
     * It writes `left`/`top` as inline styles. `!important` in a stylesheet
     * outranks a normal inline declaration, so the horizontal placement can be
     * re-taken in CSS; `top` is left to the primitive.
     *
     * `anchor` names the element the panel should centre on. It must resolve to
     * exactly one element at a time, which is why every anchor selector includes
     * the trigger's own `aria-expanded="true"` state: only the open trigger's
     * wrapper carries the anchor name, so two dialogs can never collide.
     */
    function anchoredDialog({ id, signature, fallback, anchor }) {
      return {
        kind: 'component',
        id,
        role: 'floating-dialog',
        signature,
        fallback,
        rules: (selector) => {
          const anchorSelector = typeof anchor === 'function' ? anchor(selector) : anchor;
          return `
${anchorSelector} {
  anchor-name: --vt-anchor-${id};
}
${selector} {
  position-anchor: --vt-anchor-${id} !important;
  left: anchor(center) !important;
  translate: -50% 0 !important;
}`;
        },
      };
    }

    const PATCHES = [
      {
        kind: 'tokens',
        id: 'palette',
        source: 'vt-interface:clean-white',
        tokens: () => {
          const tokens = {};
          for (const [step, hex] of Object.entries(WARM_RAMP)) {
            tokens[`--dsw-static-neutral-bluish-${step}`] = { light: hex, dark: hex };
          }
          return Object.assign(tokens, ALIAS, {
            /**
             * A surface this plugin owns: the queue panel must not inherit the
             * popover material, so it reads a token we control instead of
             * overriding the shared one and restyling every menu with it.
             */
            '--vt-queue-fill': { light: QUEUE_FILL.light, dark: QUEUE_FILL.dark },
            /**
             * Build marker: a custom property nothing consumes, so it has no
             * visual effect. It shows up in Theme.listTokens, which makes it the
             * cheapest way to prove WHICH client module generation is running —
             * i.e. to tell a cached module from a freshly loaded one.
             */
            '--vt-interface-build': { light: VERSION, dark: VERSION },
          });
        },
      },
      {
        kind: 'variables',
        id: 'composer-elevation',
        // Codex desktop `--elevation-composer`: a wide-but-faint 1px ring, a
        // near shadow that grounds the edge, and a huge directional halo
        // (80px blur, 2.4%, +8px spread) instead of a tight grey haze.
        variables: {
          '--dsw-elevation-soft': {
            light: '0 0 0 1px #0000000a, 0 2px 8px 0 #0000000a, 0 4px 80px 8px #00000006',
            dark: 'inset 0 0 1px 0 #ffffff33',
          },
        },
      },
      {
        kind: 'tokens',
        id: 'menu-surface',
        source: 'vt-interface:menu-surface',
        /**
         * Every popover in the app paints through one shared material layer
         * (`._material_ri079_*`): `background: var(--dsw-menu-surface-fill)` plus
         * `backdrop-filter: var(--dsw-menu-backdrop-filter)`. Three tokens
         * therefore restyle the add menu, the model menu, the session stats card,
         * the schedule panel and every other popover at once.
         *
         * Shipped values are a 58%-opaque grey glass blurred at 40px with
         * `saturate(150%)`. That combination lets the page colour bleed through
         * AND boosts it, so the panel reads grey and tinted by whatever sits
         * behind it; the same menu looks different depending on position.
         * Codex uses a near-opaque surface with a short blur, which is why its
         * panels stay clean.
         *
         * Only declared on `body`, so the Theme service reaches every descendant.
         */
        tokens: () => ({
          '--dsw-menu-surface-fill': { light: '#fffffff5', dark: '#232324f5' },
          // macOS redefines this one on `html[data-platform=darwin] body`; an
          // inline value on body wins over that rule.
          '--dsw-specific-menu': { light: '#fffffff5', dark: '#232324f5' },
          '--dsw-menu-backdrop-filter': { light: 'blur(8px)', dark: 'blur(8px)' },
        }),
      },
      {
        kind: 'variables',
        id: 'floating-elevation',
        /**
         * Edge of every floating layer. DSH declares this token on
         * `body, body *`, so it has to be redeclared rather than themed.
         *
         * Shipped: `0 0 0 .5px <4% stroke>, 0 3px 8px 4%, 0 0 20px 5%` — a very
         * faint hairline plus a wide ambient halo, which leaves the panel with no
         * readable edge and a soft grey smudge around it.
         * Codex menus use `--shadow-hairline` + `--shadow-xl`: a 10% hairline and
         * one tighter, darker shadow. The stroke is baked into the value so the
         * per-panel `--dsw-elevation-stroke-color` can no longer wash it out.
         */
        variables: {
          '--dsw-elevation-prominent': {
            light: '0 0 0 0.5px #0000001a, 0 8px 16px -4px #0000001f',
            dark: '0 0 0 0.5px #ffffff1a, 0 8px 16px -4px #00000059',
          },
        },
      },
      {
        kind: 'component',
        id: 'composer-submit',
        role: 'composer-submit',
        /**
         * Signature every candidate rule must carry. Verified unique against
         * 0.2.1-rc.5: only the submit button combines a 34px square, a 999px
         * radius, display:grid and the button-info-fill background.
         */
        signature: [
          'width:34px',
          'height:34px',
          'border-radius:999px',
          'display:grid',
          'button-info-fill',
        ],
        /** Used before stylesheets are readable; stale values are harmless. */
        fallback: '.JZLxKW_primary',
        /**
         * Shipped button is 34x34 with a 2px glyph stroke, while sibling icon
         * controls are 28x28 with 1.5px (mic) and 1px (plus).
         */
        rules: (selector) => `
${selector} {
  width: 28px !important;
  height: 28px !important;
  transform: none !important;
}
${selector} svg,
${selector} svg * {
  stroke-width: 1.5 !important;
}
${selector} svg {
  width: 14px !important;
  height: 14px !important;
}`,
      },
      {
        kind: 'component',
        id: 'composer-row-insets',
        role: 'composer-tool-row',
        /**
         * Concentric corners — corrected premise.
         *
         * The card corner is a squircle (corner-shape: superellipse(1.5) comes
         * from the shipped token sheet), so the circle-inscribed rule
         * gap = R - r = 14px does NOT hold here; applying it pushed the corner
         * controls further inside than the shipped layout (right gap measured
         * 8-9px, bottom 6px).
         *
         * The shipped row padding is "2px 8px 6px": the bottom inset is
         * accepted as correct, so the sides are brought to the same 6px to give
         * one optical inset around the card instead of two different ones.
         */
        signature: ['flex-wrap:wrap', 'padding:2px8px6px', 'container-type:inline-size'],
        fallback: '.JZLxKW_row',
        rules: (selector) => `
${selector} {
  padding: 2px 6px 6px !important;
}`,
      },
      {
        kind: 'component',
        id: 'composer-voice-button',
        role: 'composer-voice',
        /**
         * The composer mic is a primitives Button wearing the voice plugin's
         * `trigger` skin. Read from the live DOM: its classes are
         * `…ghost… sm… <plugin>_trigger`, it measures 28x28, and its computed
         * radius is 8px — because the plugin rule declares only
         * `flex:none;width:28px;padding:0` and the radius falls through to the
         * primitives' ghost button. That fall-through is why the hover hotspot
         * stayed a rounded square.
         *
         * Discovery therefore targets the bare rule itself: same geometry, no
         * radius of its own, selector ending in `_trigger`. The recording-state
         * round button keeps its own attribute fallback.
         *
         * Signature tokens must be LONGHANDS. The CSSOM re-serializes shorthands,
         * so the authored `flex: none` reads back as `flex: 0 0 auto` — matching
         * on it made this patch report `fallback` on every boot, held up only by
         * the shipped hash. Width and padding survive serialization verbatim, and
         * `_trigger$` plus the border-radius rejection already leave one rule.
         */
        signature: ['width:28px', 'padding:0'],
        reject: ['border-radius'],
        selectorFilter: '_trigger$',
        fallback: '.pn0E2q_trigger',
        rules: (selector) => {
          // The recording state ships as a sibling class in the same module. Derive
          // it from the resolved selector instead of matching `[class*="roundButton"]`,
          // which would also restyle every unrelated component using that word.
          const round = moduleSibling(selector, 'roundButton');
          const targets = round ? `${selector},\n${round}` : selector;
          return `
${targets} {
  width: 28px !important;
  height: 28px !important;
  border-radius: 999px !important;
  ${CONTROL_SHAPE}
}
/* The ghost skin paints its hover background at the component radius, which
 * resolved to a rounded square on a 28px control. Round the plate itself; no
 * other control in the app is touched. */
${selector}:hover,
${selector}:focus-visible {
  border-radius: 999px !important;
  background-color: var(--dsw-alias-interactive-bg-hover) !important;
  ${CONTROL_SHAPE}
}`;
        },
      },
      {
        kind: 'component',
        id: 'composer-select-chips',
        role: 'composer-text-chip',
        /** Permission and model chips are separate components; style both. */
        match: 'all',
        /**
         * The composer's permission and model controls are `.X_select`:
         * radius var(--dsw-radius-sm) = 8px on a 28px-tall control, so the hover
         * hotspot reads as a rounded square. Text chips belong to the pill class.
         *
         * The earlier patch targeted `._4pRlHW_selector` — a different component
         * (radius-md, 36px tall) — which is why nothing changed. Targets now come
         * only from discovery or the one shipped fallback; no substring selectors,
         * so other components' chips are never collateral damage.
         */
        signature: ['border-radius:var(--dsw-radius-sm)', 'max-width:220px', 'height:28px', '--dsw-alias-label-secondary'],
        fallback: '.JZLxKW_select',
        rules: (selector) => `
${selector} {
  border-radius: 999px !important;
  font-weight: ${CJK_LABEL_WEIGHT} !important;
  ${CONTROL_SHAPE}
}`,
      },
      {
        kind: 'component',
        id: 'composer-model-trigger',
        role: 'composer-model',
        /** Same pill language for the model dropdown trigger (radius-sm = 8px). */
        signature: ['height:28px', 'border-radius:var(--dsw-radius-sm)', 'max-width:min(360px,45cqw)'],
        fallback: '.htuFrW_trigger',
        rules: (selector) => `
${selector} {
  border-radius: 999px !important;
  ${CONTROL_SHAPE}
}`,
      },
      {
        kind: 'component',
        id: 'composer-plan-indicator',
        role: 'composer-plan',
        /**
         * The plan-mode chip is rendered by the plan plugin only while plan mode
         * is on; clicking it leaves plan mode (`chip.on.aria` = "计划模式已开启，
         * 按下关闭"). Upstream paints it as a selected business-blue chip
         * (tertiary fill + primary text), which reads as a loud toggle inside an
         * otherwise quiet tool row.
         *
         * Reference (Codex composer): a hairline separator, then a neutral chip
         * that only reveals itself on hover, where the leading glyph becomes the
         * app's own filled close-circle. That glyph already ships as
         * `IconCloseCircleFillRegular` — only the colour has to change, so this
         * patch stays CSS-only and keeps the native accessibility strings.
         *
         * The separator hangs off the chip instead of a wrapper so it lands in
         * the row gap no matter which flex container renders the control.
         */
        signature: [
          'background:var(--dsw-alias-state-business-tertiary)',
          'border-radius:var(--dsw-radius-sm)',
          'height:28px',
        ],
        fallback: '.kKSgSq_chip',
        rules: (selector) => {
          // Same module as the chip, so no substring matching is needed.
          const closeGlyph = moduleSibling(selector, 'hoverGlyph');
          return `
${selector} {
  position: relative !important;
  margin-left: 8px !important;
  border-radius: 999px !important;
  background-color: transparent !important;
  color: var(--dsw-alias-label-secondary) !important;
  font-weight: ${CJK_LABEL_WEIGHT} !important;
  ${CONTROL_SHAPE}
}
${selector}::before {
  content: '' !important;
  position: absolute !important;
  left: -8.5px !important;
  top: 50% !important;
  width: 0.5px !important;
  height: 12px !important;
  margin-top: -6px !important;
  border-radius: 1px !important;
  background-color: var(--dsw-alias-border-l2) !important;
  pointer-events: none !important;
}
${selector}:hover:not(:disabled),
${selector}:focus-visible {
  background-color: var(--dsw-alias-interactive-bg-hover) !important;
}
/* One step lighter than the label, so the close affordance reads as a hint
 * rather than as an error state. */
${selector}:hover:not(:disabled)${closeGlyph ? ` ${closeGlyph}` : ''},
${selector}:focus-visible${closeGlyph ? ` ${closeGlyph}` : ''} {
  color: var(--dsw-alias-label-tertiary) !important;
}`;
        },
      },
      {
        kind: 'component',
        id: 'composer-add-button',
        role: 'composer-add',
        /**
         * DSH ships the composer's "+" as a filled plate: a 247,246,244 circle
         * behind an 11x11 plus. Every other control in the row is a bare glyph
         * that only paints a plate on hover (mic, permission chip, model name),
         * so the one button that adds something is also the only one that looks
         * permanently pressed — it reads as a badge, not as an action.
         *
         * Codex keeps its "+" quiet until hovered. Same treatment here: drop the
         * fill, reuse the mic's own hover token so the two icon buttons respond
         * identically, and scale the glyph down to the row's optical size (see
         * ADD_GLYPH).
         *
         * Signature is the plate itself: `--dsw-specific-selector` as a background
         * plus a 28px height and centred grid is the only rule in the app that
         * matches. The glyph rules are scoped under the resolved selector.
         */
        signature: ['background:var(--dsw-specific-selector)', 'height:28px', 'place-items:center'],
        selectorFilter: '_add$',
        fallback: '.JZLxKW_add',
        rules: (selector) => `
${selector} {
  background: transparent !important;
  border-radius: 999px !important;
  margin-right: -${ADD_PULL}px !important;
  ${CONTROL_SHAPE}
}
/* Same token the mic uses, so the two icon buttons answer the pointer alike. */
${selector}:hover:not(:disabled),
${selector}:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
${selector} svg {
  width: ${ADD_GLYPH.size}px !important;
  height: ${ADD_GLYPH.size}px !important;
}
${selector} svg * {
  stroke-width: ${ADD_GLYPH.stroke} !important;
}`,
      },
      anchoredDialog({
        id: 'stat-dialog-anchor',
        /**
         * The composer's stat pills (turns/steps, token usage) open a dialog that
         * is portalled to <body> and placed by `useAnchoredPosition`. That
         * primitive only accepts `align: 'start' | 'end'` — there is no centred
         * option — and the chat plugin passes neither, so the panel's left edge
         * lands on the pill's left edge. On a wide panel over a narrow pill that
         * reads as "hanging off to the right".
         *
         * The anchor is the pill's own wrapper, which already ships the stable
         * `data-composer-stat` attribute, and only the open pill has
         * `aria-expanded="true"` — so `:has()` names exactly one anchor without
         * touching any CSS-module hash.
         *
         * Signature tokens avoid anything the CSSOM rewrites: the authored
         * `min(300px, 100vw - 24px)` reads back as `min(300px, -24px + 100vw)`,
         * so only the stable prefix `max-width:min(440px,` is matched, paired
         * with `width:max-content` which no sibling panel shares.
         */
        signature: ['width:max-content', 'max-width:min(440px,', 'border-radius:var(--dsw-radius-lg)'],
        fallback: '.mR10tW_panel',
        anchor: '[data-composer-stat]:has(> button[aria-expanded="true"])',
      }),
      anchoredDialog({
        id: 'context-meter-anchor',
        /**
         * Same primitive, different component: the context ring
         * (`上下文已用 27%`) portals its breakdown panel the same way. Its module
         * declares `root`, `trigger` and `panel` together, so the anchor wrapper
         * is derived from the resolved panel selector instead of a data hook.
         * The trigger sits inside a Tooltip wrapper, hence a descendant `:has()`
         * rather than a child combinator.
         */
        signature: ['width:min(264px,', 'border-radius:var(--dsw-radius-lg)', 'padding:12px'],
        fallback: '.X0HXfW_panel',
        anchor: (selector) => `${moduleSibling(selector, 'root')}:has(button[aria-expanded="true"])`,
      }),
      {
        kind: 'component',
        id: 'turn-rail',
        role: 'turn-rail',
        /**
         * Shipped: a 28px strip pinned 12px inside the pane's RIGHT edge, every
         * mark a 20px bar grown from its right end. The turn in view draws 20px,
         * the hovered one 18px — shorter than the one you are already on, so the
         * pointer pushes the wrong way — and the neighbours never move. Position
         * is a 2px difference on a 20px bar: unreadable, and the strip sits on
         * the far side of the reading column from the sidebar.
         *
         * Codex reads the same information as a wave: every turn is a 6px tick,
         * the pointer grows the tick it is on to 26px, its neighbours step down
         * (20/14/10px) and settle back on a 160ms spring. Position is carried by
         * LENGTH (a scan line you can feel while moving); colour only separates
         * "here" from "hovered".
         *
         * Selector discovery targets the frame rule — the only rule in the app
         * that combines a 28px width with `contain: layout` and `right: 12px`.
         * Every other class comes from the same CSS-module prefix via
         * `moduleSibling`, so no substring selector ever touches another
         * component's marks.
         */
        signature: ['width:28px', 'contain:layout', 'position:absolute', 'right:12px'],
        selectorFilter: '_frame$',
        fallback: '._4if9eW_frame',
        rules: (selector) => {
          const mark = moduleSibling(selector, 'mark');
          const active = moduleSibling(selector, 'markActive');
          const unloaded = moduleSibling(selector, 'markUnloaded');
          const preview = moduleSibling(selector, 'preview');
          const promptLine = moduleSibling(selector, 'previewPrompt');
          const responseLine = moduleSibling(selector, 'previewResponse');
          /** One bar length as a scaleX transform, always around the left edge. */
          const bar = (px) => `transform: translateY(-50%) scaleX(${railScale(px)}) !important;`;
          /**
           * Marks at `level` rows from the hovered one, in both directions. Built
           * from the resolved class so the wave cannot leak to another rail.
           *
           * The list is virtualised with `overscan: 3`, so only ±3 rows exist in
           * the DOM at any time — exactly the depth the wave needs. Deeper
           * plateaus would silently clip at the rendered window's edge.
           */
          const around = (level) => {
            const chain = Array(level).fill(mark).join(' + ');
            return [
              `${mark}:has(+ ${chain}:hover)::before`,
              `${mark}:hover + ${chain}::before`,
            ].join(',\n');
          };
          return `
${selector} {
  left: ${RAIL.left}px !important;
  right: auto !important;
  width: ${RAIL.width}px !important;
}
/* Rest: a tick, not a dash. The 2px height and the module's own colour fall
 * through; length, growing edge, end radius and easing are replaced. */
${mark}::before {
  left: 0 !important;
  right: auto !important;
  width: ${RAIL.bar}px !important;
  border-radius: ${RAIL.radius}px !important;
  transform-origin: 0 50% !important;
  background-color: var(--dsw-alias-border-l4) !important;
  ${bar(RAIL.rest)}
  transition-property: transform, background-color !important;
  transition-duration: ${RAIL.springMs}ms !important;
  transition-timing-function: ${RAIL_SPRING} !important;
}
${unloaded}::before {
  opacity: 0.5 !important;
}
/* Turns paged in from history: readable, but not competing with the wave. */
${active}::before {
  ${bar(RAIL.active)}
  background-color: var(--dsw-alias-label-tertiary) !important;
}
/* The pointer owns the emphasis — this is the bar that reads as "piano". */
${mark}:hover::before {
  ${bar(RAIL.bar)}
  background-color: var(--dsw-alias-label-primary) !important;
}
${around(1)} { ${bar(RAIL.neighbors[0])} }
${around(2)} { ${bar(RAIL.neighbors[1])} }
${around(3)} { ${bar(RAIL.neighbors[2])} }
/* Keyboard users get the same emphasis without a pointer. */
${mark}:focus-visible::before {
  ${bar(RAIL.bar)}
  background-color: var(--dsw-alias-label-primary) !important;
}
/* Preview now opens away from the rail, i.e. to the right, and takes the
 * popover recipe the menu surfaces already use. */
${preview} {
  left: calc(100% + ${RAIL.gap}px) !important;
  right: auto !important;
  width: ${RAIL.previewWidth}px !important;
  max-height: ${RAIL.previewMaxHeight}px !important;
  padding: ${RAIL.previewPadding} !important;
  border-radius: ${RAIL.previewRadius}px !important;
  background: var(--dsw-menu-surface-fill) !important;
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;
  box-shadow: var(--dsw-elevation-prominent), inset 0 0 0 0.5px var(--dsw-alias-border-l2) !important;
  transition: top ${RAIL.glideMs}ms cubic-bezier(0.2, 0.8, 0.2, 1) !important;
  animation: 120ms ease-out vt-turn-preview-in !important;
}
@keyframes vt-turn-preview-in {
  from { opacity: 0; translate: -4px 0; }
  to { opacity: 1; translate: 0 0; }
}
${promptLine} {
  font-size: 13px !important;
  line-height: 18px !important;
  font-weight: 500 !important;
}
${responseLine} {
  font-size: 12px !important;
  line-height: 18px !important;
  margin-top: 2px !important;
}
@media (prefers-reduced-motion: reduce) {
  ${mark}::before,
  ${preview} {
    transition-duration: 0s !important;
    animation: none !important;
  }
}`;
        },
      },
      {
        kind: 'behavior',
        id: 'composer-tooltip',
        /**
         * The permission and model chips carry their help text in a native `title`
         * attribute, which the OS draws as a square grey box that ignores the
         * whole design system. The stat pills next to them use the app's own
         * <Tooltip>, so the composer ends up with two unrelated tooltip looks.
         *
         * Bubble geometry and tokens copied from the app's tooltip surface
         * (`._bubble_44yfq_1`): 3px 7px padding, radius-sm, 13/20 type, dark
         * `--dsw-alias-tooltip-bg` on `--dsw-static-neutral-bluish-00`.
         */
        /** Named, not wired: the adapter layer owns the implementation. */
        behavior: 'native-tooltip',
        css: () => `
.vt-interface-tip {
  position: fixed;
  z-index: 3000;
  box-sizing: border-box;
  width: max-content;
  max-width: min(50vw, calc(100vw - 24px));
  padding: 3px 7px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-static-neutral-bluish-00);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-line;
  overflow-wrap: break-word;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.vt-interface-tip[data-visible='true'] { opacity: 1; }`,
      },
      {
        kind: 'behavior',
        id: 'scroll-edges',
        /**
         * The transcript is clipped by the header line above and by the composer
         * below. Both edges cut a line of text in half.
         *
         * A mask on the scrollport cannot fix the bottom edge: the composer seat
         * is a sticky CHILD of that scroller, so masking the scroller would fade
         * the composer card itself. The seat does ship its own 36px gradient, but
         * the card starts ~8px below the seat's top, so only those 8px are ever
         * visible — the rest is painted behind an opaque card. That is why this
         * one is a `behavior`: it needs the scroll position (CSS cannot read it)
         * and a band anchored to the seat's top edge (CSS cannot find it).
         *
         * The injected node is inert (pointer-events: none, aria-hidden) and
         * below the composer in z-order, so a fade can never cover a control.
         * Releasing removes the node, its listeners and its attributes.
         */
        behavior: 'scroll-edges',
        css: () => `
.vt-edge-fade {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
.vt-edge-fade::before,
.vt-edge-fade::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: ${EDGE_FADE.size}px;
  opacity: 0;
  transition: opacity ${EDGE_FADE.settleMs}ms ease-out;
}
.vt-edge-fade::before {
  top: 0;
  background: linear-gradient(to bottom, var(--dsw-alias-bg-base), transparent);
}
.vt-edge-fade::after {
  bottom: var(--vt-fade-bottom, 0px);
  background: linear-gradient(to top, var(--dsw-alias-bg-base), transparent);
}
.vt-edge-fade[data-top='true']::before,
.vt-edge-fade[data-bottom='true']::after {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .vt-edge-fade::before,
  .vt-edge-fade::after { transition: none; }
}`,
      },
      {
        kind: 'component',
        id: 'view-tabs',
        /**
         * The header's tab row is a slot consumer, not a slot: `conversation.view`
         * supplies what the tabs *say*, but their container, spacing, indicator
         * and the "…" menu are hard-coded in `ConversationSessionHeader`. There is
         * no official switch to remove them — so this patch only takes them off
         * screen and hands the height back (see VIEW_TABS for why `min-height`
         * needs restating).
         *
         * The tabs stay in the DOM on purpose: their `onClick` is the only route
         * into a view that does not require the conversation package's private
         * store, and the composer entry clicks them (see `installViewSwitch`).
         */
        signature: ['flex-wrap:wrap', 'gap:16px20px', 'margin-top:10px', 'padding-left:8px'],
        selectorFilter: '_tabs$',
        fallback: '.kiGsTW_tabs',
        rules: (selector) => {
          const header = moduleSibling(selector, 'header');
          return [
            /**
             * Zero height, not `display:none`. The row's own width is a React
             * input: `visibleViewLimit = floor((row.clientWidth - 48) / 120)` and
             * anything past the limit is moved into the "…" menu, which unmounts
             * its button. Hiding the row with `display:none` measures 0, so the
             * limit collapses to 1 and 轨迹 leaves the DOM — measured, not
             * assumed. Keeping the width and taking the height leaves the tab
             * buttons mounted for the composer entry to click.
             */
            `${selector} { height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }`,
            // Same geometry the shipped no-tab variant states, said louder: our
            // rule ties with `.header:where(:not(:has(.tabs)))` on specificity.
            `${header}:has(${selector}) { min-height: 0 !important; padding-bottom: ${VIEW_TABS.headerBottom}px !important; }`,
          ].join('\n');
        },
      },
      {
        kind: 'component',
        id: 'queue-surface',
        /**
         * The queued-message panel is a step above the canvas, not a popover —
         * but it paints `var(--dsw-specific-menu)`, the shared popover material,
         * so the menu-surface patch flattened it to white along with every menu.
         *
         * Scoped by `[data-queue-dock]` rather than by the class alone: the goal
         * is one panel, and the signature (`isolation`/`width:100%`/`overflow`
         * on a `_panel` rule) could in principle also describe a future menu
         * panel. The dock attribute keeps the blast radius to this one surface.
         */
        signature: ['isolation:isolate', 'width:100%', 'overflow:hidden', 'position:relative'],
        selectorFilter: '_panel$',
        fallback: '._6DJyyG_panel',
        rules: (selector) => `[data-queue-dock] ${selector}::before { background: var(--vt-queue-fill) !important; }`,
      },
      {
        kind: 'component',
        id: 'user-bubble',
        /**
         * The bubble the user's own message is painted on — the only surface in
         * the app filled with `--dsw-specific-bubble`, which makes the signature
         * unambiguous without naming a hashed class.
         *
         * This patch owns the clamp, the "…" row and the disclosure block,
         * because all three are placed against the bubble's own line box.
         * `data-vt-clamp` is written by the `message-clamp` behaviour.
         *
         * The two extra rows are a SIBLING of the bubble, not rows inside it:
         * `overflow: hidden` clips at the PADDING box, so a reserved
         * `padding-bottom` would still have text painted over it (trap 10). The
         * clamp therefore zeroes the bottom padding, which puts the clip edge
         * exactly on the 19th line's bottom edge, and the block below carries the
         * same fill plus squared top corners, so both boxes read as one bubble.
         */
        signature: ['background:var(--dsw-specific-bubble)'],
        selectorFilter: '_bubble$',
        fallback: '.AkCqbG_bubble',
        rules: (selector) => {
          const { rows, rowGap, padding, stackGap, textGap, glyph, iconGap } = MESSAGE_CLAMP;
          return `
${selector}[data-vt-clamp="clamped"] {
  max-height: calc(${rows - 1} * (22px + var(--dsh-content-font-delta, 0px))) !important;
  overflow: hidden !important;
  padding-bottom: 0 !important;
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}
${selector}[data-vt-clamp="expanded"] {
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}
.vt-msg-clamp-tail {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: ${rowGap}px;
  /* Sibling inside .userStack, a flex column with an 8px gap: cancel it so the
     two filled boxes touch, and restore the bottom corners here. */
  margin-top: -${stackGap}px;
  padding: 0 ${padding.x}px ${padding.bottom}px;
  background: var(--dsw-specific-bubble);
  border-radius: 0 0 var(--dsw-radius-xl) var(--dsw-radius-xl);
}
${selector}[data-vt-clamp="expanded"] + .vt-msg-clamp-tail {
  padding-top: ${textGap}px;
}
.vt-msg-clamp-more {
  height: calc(22px + var(--dsh-content-font-delta, 0px));
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  user-select: none;
}
${selector}[data-vt-clamp="expanded"] + .vt-msg-clamp-tail .vt-msg-clamp-more {
  display: none !important;
}
.vt-msg-clamp-toggle {
  display: flex;
  align-items: center;
  gap: ${iconGap}px;
  height: calc(22px + var(--dsh-content-font-delta, 0px));
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1;
  /* label-secondary, not the disclosure rows' label-tertiary: those sit on the
     white canvas, this one on the tinted fill where tertiary drops under 4:1. */
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: color 0.1s;
}
.vt-msg-clamp-toggle:hover {
  color: var(--dsw-alias-label-primary);
}
.vt-msg-clamp-toggle:focus-visible {
  outline: 1.5px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
  border-radius: var(--dsw-radius-sm);
}
.vt-msg-clamp-icon {
  display: inline-flex;
  flex: none;
}
.vt-msg-clamp-icon svg {
  display: block;
  width: ${glyph.box}px;
  height: ${glyph.box}px;
}
@media (prefers-reduced-motion: reduce) {
  .vt-msg-clamp-toggle { transition: none; }
}`;
        },
      },
      {
        kind: 'behavior',
        id: 'view-switch',
        /**
         * 「轨迹」is a low-frequency view that was spending a permanent 36px row
         * of header on every conversation. The entry below the composer costs
         * nothing when it is not used, and it sits where the other per-session
         * readings already are.
         *
         * A behaviour, not a component patch: the entry is a live control whose
         * label and direction follow the active view. CSS cannot read that state
         * and cannot carry a click handler.
         *
         * Its node comes from the slot system rather than a DOM injection because
         * React owns this row: the two shipped readings are slot entries, and a
         * hand-inserted sibling would be reordered or dropped on the next render.
         */
        behavior: 'view-switch',
        css: () => '',
      },
      {
        kind: 'behavior',
        id: 'message-clamp',
        /**
         * A long user message is clamped to 20 rendered rows, with a disclosure
         * row inside its own bubble. A behaviour, not a component patch: the
         * decision ("is this message longer than 20 rows?") needs a layout
         * measurement, and the toggle has to remember one bit of state per
         * message. CSS can do neither.
         *
         * The style half lives in `user-bubble`, because the geometry has to key
         * off the discovered bubble class. This entry owns the DOM half: the
         * state attribute, the sibling disclosure block, the ellipsis row.
         */
        behavior: 'message-clamp',
        css: () => '',
      },
      {
        kind: 'behavior',
        id: 'scroll-pin',
        /**
         * Keep the reader's place while an answer streams.
         *
         * The transcript owns one policy: content growth scrolls the tail into
         * view (`onResize` → `followTail()`). For a long answer that policy walks
         * the answer's own beginning off the top, so the reader ends up scrolling
         * back to read text that was pushed away while it was being written.
         *
         * This is a behaviour for two reasons that CSS cannot reach:
         *
         *   · the decision needs the live geometry of this turn's user row and the
         *     scroll position — neither is readable from a stylesheet;
         *   · `data-chat-following-tail` is React state, and `followTail()` writes
         *     `true` back even when the landing was clamped, so the freeze cannot
         *     be expressed by toggling that state. It has to be applied at the one
         *     place the tail movement passes through: the scrollport's own write.
         *
         * Took over: `element.scrollTop` and `element.scrollTo` on the transcript
         * scrollport, as own properties shadowing `Element.prototype`, so every
         * follow write — instant or smooth — passes one clamp. Nothing global is
         * patched, no event is synthesized, and disposing deletes the two own
         * properties, which restores the shipped behaviour exactly.
         *
         * The rule: nothing follows after the answer starts. The first write after
         * the answer row appears freezes the viewport where it is — the growing
         * answer then never moves it — and `SCROLL_PIN.offset` is used only for the
         * one catch-up move when the answer's first line is off screen.
         *
         * Values live in `SCROLL_PIN`; the state machine is in `installScrollPin`.
         */
        behavior: 'scroll-pin',
      },
      {
        kind: 'behavior',
        id: 'to-bottom-visibility',
        /**
         * The floating "back to bottom" button, shown only when something is
         * actually hidden below.
         *
         * DSH renders it on one condition — `!followingTail` — and never looks at
         * the scroll geometry, so it appears the moment the app decides it is not
         * following, even with nothing left below the fold. The reader's rule is
         * the geometric one: there is more content down there, so offer the way
         * back.
         *
         * A behaviour, not CSS: reading `scrollTop` and `scrollHeight` is the whole
         * job, and no selector can do that. It only toggles `display` on that one
         * button, remembers nothing else, and restores it on dispose.
         */
        behavior: 'to-bottom-visibility',
      },
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // CSSOM SUBSTRATE — the only two primitives with two real consumers:
    // adapter discovery walks the sheets to resolve a target, the probe walks
    // them to audit which rule won. Shared instead of duplicated, and free of
    // policy: they answer "what is reachable", never "what should change".
    // ═══════════════════════════════════════════════════════════════════════


    /**
     * Every stylesheet reachable from the document.
     *
     * `<style>`/`<link>` sheets cover most plugins, but a plugin may ship its CSS
     * in a constructed sheet installed through `adoptedStyleSheets` — those never
     * appear in `document.styleSheets`, so a signature scan limited to the
     * document list silently degrades to the hard-coded fallback. That is why the
     * voice-button patch reports `fallback` while still working: only the shipped
     * hash keeps it alive. Shadow roots are walked for the same reason.
     */
    function collectStyleSheets() {
      if (typeof document === 'undefined') return [];
      const sheets = [];
      const seen = new Set();
      const add = (list) => {
        for (const sheet of Array.from(list || [])) {
          if (!sheet || seen.has(sheet)) continue;
          seen.add(sheet);
          sheets.push(sheet);
        }
      };
      add(document.styleSheets);
      add(document.adoptedStyleSheets);
      for (const el of document.querySelectorAll('*')) {
        if (!el.shadowRoot) continue;
        add(el.shadowRoot.styleSheets);
        add(el.shadowRoot.adoptedStyleSheets);
      }
      return sheets;
    }


    /** Depth-first walk over plain rules and grouping rules (@media, @layer). */
    function walkRules(sheets, visit) {
      const walk = (rules) => {
        for (const rule of Array.from(rules || [])) {
          if (!rule.selectorText && rule.cssRules) { walk(rule.cssRules); continue; }
          if (!rule.selectorText || !rule.style) continue;
          visit(rule);
        }
      };
      for (const sheet of sheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (err) { continue; } // opaque sheet
        try { walk(rules); } catch (err) { /* malformed sheet */ }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADAPTERS — the anti-corruption layer, behind a single face.
    //
    // The engine never sees a resolver, a selector, a stylesheet or a token
    // name: it asks for `applyTokenPatches` / `sync` / `installBehaviors` and
    // gets back the state it has to report. Everything DSH-specific — hashed
    // classes, `body, body *` declarations, literal geometry — stops inside
    // this closure.
    // ═══════════════════════════════════════════════════════════════════════

    function createAdapters(ctx, patches) {
      /** Disposers for everything the adapters acquire, released in reverse. */
      const disposers = [];
      /** Why a behaviour failed to install; surfaced through diagnostics. */
      const behaviorErrors = [];
      /**
       * Measurements a behaviour publishes into the report channel. Behaviours do
       * not produce `--vt-report-<patch>` tokens (they resolve no selectors), so
       * without this a behaviour could install successfully and still be
       * invisible to the one verification channel that works without DevTools.
       */
      const behaviorMetrics = {};
      /**
       * Live readout of the reading-position freeze, set by `scroll-pin` once it
       * installs. The engine hands it to diagnostics and the probe rather than
       * letting either one re-derive the state from the DOM.
       */
      let scrollPinReadout = null;
      /** Created on first sync, so a document-less host never touches the DOM. */
      let sheet = null;
      const ensureSheet = () => sheet || (sheet = createStyleHost(ctx));


      // ═══════════════════════════════════════════════════════════════════════
      // ADAPTERS — the anti-corruption layer. Each takes one patch and returns a
      // disposer. They are the only code allowed to know how DSH works.
      // ═══════════════════════════════════════════════════════════════════════

      /** Theme service: light/dark token pairs, revoked by dropping the layer. */
      function applyTokens(patch, ctx) {
        return ctx.theme.overrideTokens(patch.source, patch.tokens());
      }


      /**
       * DSH declares these properties on `body, body *`, so every element
       * re-declares them and an inline value on `body` never reaches a descendant.
       * Redeclaring on the same selector pair with !important is the only way in,
       * and it avoids hashed class names entirely.
       */
      function renderVariables(patch) {
        const valueFor = (name, scheme) => patch.variables[name][scheme];
        const names = Object.keys(patch.variables);
        const light = names.map((n) => `  ${n}: ${valueFor(n, 'light')} !important;`).join('\n');
        const dark = names.map((n) => `  ${n}: ${valueFor(n, 'dark')} !important;`).join('\n');
        return [
          `body, body * {\n${light}\n}`,
          `body[data-ds-dark-theme], body[data-ds-dark-theme] * {\n${dark}\n}`,
        ].join('\n');
      }


      /**
       * Resolve a component target from the live CSSOM by rule signature, so the
       * result survives CSS-module hash changes. Returns null when no candidate is
       * readable yet; callers fall back to the shipped constant.
       *
       * `sheets` is passed in so one discovery pass reads every sheet once instead
       * of once per patch.
       */
      function resolveTarget(patch, sheets) {
        if (typeof document === 'undefined') return null;
        const found = [];
        walkRules(sheets || collectStyleSheets(), (rule) => {
          const probe = (rule.style.cssText || '').replace(/\s+/g, '').toLowerCase();
          if (!patch.signature.every((token) => probe.includes(token))) return;
          // Optional exclusions: a rule carrying a rejected token is not a match.
          if (patch.reject && patch.reject.some((token) => probe.includes(token))) return;
          // Optional selector constraint, for families whose bodies look alike.
          if (patch.selectorFilter && !new RegExp(patch.selectorFilter).test(rule.selectorText)) return;
          for (const match of rule.selectorText.matchAll(/\.([A-Za-z0-9_-]+)/g)) found.push(match[1]);
        });
        if (found.length === 0) return [];
        const unique = [...new Set(found)];
        unique.sort((a, b) => {
          const pa = /_primary$/.test(a) ? 0 : 1;
          const pb = /_primary$/.test(b) ? 0 : 1;
          return pa - pb || a.length - b.length;
        });
        return unique.map((name) => `.${name}`);
      }


      /**
       * Render every component patch. A patch declares how many matches it wants:
       *   match: 'first' (default) — the single best candidate;
       *   match: 'all'             — every rule carrying the signature, for families
       *                              of controls that repeat across components.
       * Unresolved targets fall back to the shipped constant, and if even that is
       * stale the selector simply matches nothing.
       */
      function renderComponents(patches) {
        const blocks = [];
        const status = {};
        const selectorsById = {};
        // Read the stylesheet graph once per pass: adopted sheets are invisible to
        // a per-patch scan that rebuilds the list, and the walk is not free.
        const sheets = (typeof document === 'undefined') ? [] : collectStyleSheets();
        for (const patch of patches) {
          const discovered = resolveTarget(patch, sheets);
          const selectors = discovered.length
            ? (patch.match === 'all' ? discovered : discovered.slice(0, 1))
            : [patch.fallback];
          status[patch.id] = discovered.length
            ? `discovered:${selectors.length}`
            : 'fallback';
          selectorsById[patch.id] = selectors;
          blocks.push(patch.rules(selectors.join(',\n')));
        }
        return { css: blocks.join('\n'), status, selectors: selectorsById };
      }


      /**
       * Remote diagnostics without any DOM access from the maintainer's side.
       *
       * The Theme inspect provider lists token NAMES but not values, so the measured
       * result is encoded INTO the name: radius, size and padding of the first
       * element each component patch resolved to. Values are empty strings, so
       * nothing consumes these properties and nothing renders differently.
       *
       * Reading `--vt-report-<patch>-radius-<value>` is therefore enough to verify
       * that a patch both resolved AND won the cascade.
       */
      function sanitize(text) {
        return String(text)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 150);
      }


      /**
       * The always-on verification channel: the resolved state of every patch,
       * encoded into theme-token NAMES because the inspect provider lists names and
       * not values.
       *
       * Scope is deliberately narrow — "did this patch resolve, and did its
       * selector land on an element of a plausible size" — because it runs on every
       * body mutation. Anything richer (computed styles, hover rules, pseudo
       * elements) belongs to the opt-in probe, which pays for itself only while
       * debugging.
       */
      function publishReport(ctx, status, selectorsById) {
        if (typeof getComputedStyle !== 'function') return;
        const report = { build: VERSION };
        for (const [id, value] of Object.entries(status)) report[id] = value;
        for (const [id, selectors] of Object.entries(selectorsById)) {
          let firstElement = null;
          selectors.forEach((selector, index) => {
            let count = 0;
            let element = null;
            try {
              const list = document.querySelectorAll(selector);
              count = list.length;
              element = list[0] || null;
            } catch (error) {
              count = -1;
            }
            report[`${id}-s${index}-n`] = count;
            if (!firstElement && element) firstElement = element;
          });
          if (!firstElement) { report[`${id}-el`] = 'none'; continue; }
          const style = getComputedStyle(firstElement);
          const rect = firstElement.getBoundingClientRect();
          report[`${id}-radius`] = style.borderRadius;
          report[`${id}-size`] = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
          if (id.includes('row')) report[`${id}-pad`] = style.padding;
          // The two numbers the long-message clamp derives from: the line box it
          // counts in, and the box model its max-height is measured against.
          if (id === 'user-bubble') report[`${id}-box`] = `${style.boxSizing}-${style.lineHeight}`;
        }
        // Behaviour readings: the only way to see a behaviour work without
        // DevTools, since behaviours publish no selector report of their own.
        for (const [key, value] of Object.entries(behaviorMetrics)) report[key] = value;

        const tokens = {};
        for (const [key, value] of Object.entries(report)) {
          tokens[`--vt-report-${sanitize(key)}-${sanitize(value)}`] = { light: '', dark: '' };
        }
        try {
          ctx.theme.overrideTokens('vt-interface:report', tokens);
        } catch (error) {
          /* diagnostics must never break the visual layer */
        }
      }


      /**
       * Native `title` tooltips cannot be styled: the browser/OS draws them, so no
       * selector, property or token reaches them. The app's own <Tooltip> is a React
       * component, so a plugin cannot wrap the chips in it either.
       *
       * The only route left is to take the attribute over. Inside the composer, the
       * text is moved off `title` into a private map (the element keeps its
       * `aria-label`, so assistive tech is unaffected) and re-rendered as a bubble
       * that copies the app's own tooltip geometry and tokens — see the `css()` of
       * the `composer-tooltip` patch. Reverting restores every original attribute.
       */
      function installNativeTitleTakeover(readSelectors) {
        const TIP_CLASS = 'vt-interface-tip';
        const DELAY_MS = 380;
        const GAP = 6;
        const MARGIN = 8;

        /** element -> { text (what the bubble shows), aria, fromTitle } */
        const stash = new Map();
        let tip = null;
        let showTimer;
        let hideTimer;
        let showing = null;
        let shownText = null;

        // Another component also uses `_card`; anchor discovery on the input itself,
        // otherwise the sweep quietly walks the wrong subtree and adopts nothing.
        const card = () => {
          const input = document.querySelector('textarea, [contenteditable="true"]');
          return (input && input.closest('[class*="_card"]')) || document.querySelector('[class*="_card"]');
        };

        /**
         * Which controls get a bubble. Taken from the patches that own them, so the
         * takeover cannot drift onto every button in the composer.
         */
        const watchedSelectors = () => {
          const map = (typeof readSelectors === 'function' && readSelectors()) || {};
          const list = [...(map['composer-select-chips'] || []), ...(map['composer-model-trigger'] || [])];
          return list.length ? list : ['.JZLxKW_select'];
        };

        const arm = (el) => {
          const title = el.getAttribute('title');
          const aria = el.getAttribute('aria-label') || '';
          if (title) {
            // Remember the pair: React will not restore a prop whose value never
            // changed, so after a plugin remount the attribute is gone for good.
            // The pair lets the next generation tell "same mode, attribute lost"
            // apart from "the mode switched".
            el.dataset.vtTitle = title;
            el.dataset.vtTitleAria = aria;
            stash.set(el, { text: title, aria, fromTitle: true });
            el.removeAttribute('title');
            return;
          }
          // Same mode as when the title was captured: we removed the attribute,
          // nothing changed, so keep reading the richer title text.
          if (el.dataset.vtTitle && el.dataset.vtTitleAria === aria) {
            stash.set(el, { text: el.dataset.vtTitle, aria, fromTitle: true });
            return;
          }
          // A preset that ships no native title at all (three of the four
          // permission modes), or a mode switch: describe it with aria-label.
          if (aria) stash.set(el, { text: aria, aria, fromTitle: false });
        };

        const sweep = () => {
          const root = card();
          if (!root) return;
          // 1. Everything in the composer that still carries a native title, so the
          //    composer never mixes two tooltip looks (add / mic / send included).
          for (const el of Array.from(root.querySelectorAll('[title]'))) arm(el);
          // 2. Controls that may ship no native title at all — three of the four
          //    permission presets — are named by the patches that own them.
          for (const selector of watchedSelectors()) {
            let list;
            try { list = root.querySelectorAll(selector); } catch (err) { continue; }
            for (const el of Array.from(list)) arm(el);
          }
        };

        /** Walk up a few ancestors looking for an element we manage. */
        const tracked = (node) => {
          let el = node instanceof Element ? node : null;
          for (let i = 0; el && i < 8; i += 1, el = el.parentElement) {
            if (stash.has(el)) return el;
          }
          return null;
        };

        const node = () => {
          if (tip) return tip;
          tip = document.createElement('div');
          tip.className = TIP_CLASS;
          tip.setAttribute('role', 'tooltip');
          // The visible text duplicates aria-label; keep screen readers on one.
          tip.setAttribute('aria-hidden', 'true');
          document.body.appendChild(tip);
          return tip;
        };

        const place = (el) => {
          const bubble = node();
          const rect = el.getBoundingClientRect();
          const w = bubble.offsetWidth;
          const h = bubble.offsetHeight;
          const left = Math.min(
            Math.max(rect.left + rect.width / 2 - w / 2, MARGIN),
            Math.max(MARGIN, window.innerWidth - w - MARGIN),
          );
          let top = rect.top - GAP - h;
          if (top < MARGIN) top = rect.bottom + GAP; // flip below when there is no room above
          bubble.style.left = `${Math.round(left)}px`;
          bubble.style.top = `${Math.round(top)}px`;
        };

        const hide = () => {
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
          showing = null;
          shownText = null;
          if (tip) tip.removeAttribute('data-visible');
        };

        const show = (el) => {
          const entry = stash.get(el);
          if (!entry || !entry.text) return;
          const bubble = node();
          bubble.textContent = entry.text;
          showing = el;
          shownText = entry.text;
          place(el);
          bubble.setAttribute('data-visible', 'true');
        };

        const onOver = (event) => {
          // Safety net: a control rendered between sweeps is armed right here, so
          // the native tooltip never gets the chance to appear.
          sweep();
          const el = tracked(event.target);
          if (!el) { if (showing && !tracked(event.relatedTarget)) hide(); return; }
          if (el === showing) return;
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
          if (showing) hide();
          showTimer = setTimeout(() => show(el), DELAY_MS);
        };

        const onOut = (event) => {
          const el = tracked(event.target);
          if (!el) return;
          if (tracked(event.relatedTarget) === el) return;
          clearTimeout(showTimer);
          hideTimer = setTimeout(hide, 60);
        };

        // Any movement of the page invalidates a fixed-position bubble.
        const onDismiss = () => hide();

        document.addEventListener('pointerover', onOver, true);
        document.addEventListener('pointerout', onOut, true);
        document.addEventListener('pointerdown', onDismiss, true);
        window.addEventListener('scroll', onDismiss, true);
        window.addEventListener('resize', onDismiss);

        sweep();
        // React re-renders rewrite these attributes, so re-arm on every mutation.
        // `aria-label` is watched because a preset without a native title changes
        // only that attribute when the mode switches.
        //
        // Deliberately do NOT hide here: the app mutates the body constantly while a
        // turn streams, and hiding on any mutation killed the bubble the instant it
        // appeared.
        const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
          sweep();
          // The anchor can also be replaced rather than updated; follow it.
          if (showing && !showing.isConnected) hide();
          // The help text is per-mode, so a visible bubble can go stale.
          const entry = showing ? stash.get(showing) : null;
          if (showing && entry && entry.text !== shownText) hide();
        });
        if (observer) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['title', 'aria-label'],
          });
        }

        return () => {
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
          document.removeEventListener('pointerover', onOver, true);
          document.removeEventListener('pointerout', onOut, true);
          document.removeEventListener('pointerdown', onDismiss, true);
          window.removeEventListener('scroll', onDismiss, true);
          window.removeEventListener('resize', onDismiss);
          if (observer) observer.disconnect();
          if (tip) { tip.remove(); tip = null; }
          // Only attributes we removed are restored; aria-label was never touched.
          for (const [el, entry] of stash) {
            try {
              delete el.dataset.vtTitle;
              delete el.dataset.vtTitleAria;
              if (entry.fromTitle) el.setAttribute('title', entry.text);
            } catch (err) { /* detached */ }
          }
          stash.clear();
        };
      }


      /**
       * The main transcript scrollport, or null while no conversation is open.
       *
       * Two rules, in order: a scrollport that contains a run in flight, then the
       * largest visible one. The app can render a second conversation (sidebar
       * preview, dock panel) with its own history, so "first match" and even
       * "largest box" can both land on a view the reader is not looking at — only
       * the one with `[data-chat-running]` is the transcript being written to.
       * Shared by `scroll-edges` and `scroll-pin` so "the main transcript" has
       * exactly one definition.
       */
      function pickTranscriptScroller() {
        const all = [...document.querySelectorAll('[data-conversation-scroll]')];
        const visible = all.filter((el) => el.clientHeight > 0 && el.parentElement);
        if (visible.length === 0) return null;
        // The transcript of a run in flight wins over size: secondary surfaces
        // (sidebar and dock previews) can host a second conversation, and taking
        // the largest box would then patch a view the reader is not looking at.
        const running = visible.filter((el) => el.querySelector('[data-chat-running]') !== null);
        const pool = running.length > 0 ? running : visible;
        return pool.reduce((best, el) => (el.clientHeight > best.clientHeight ? el : best));
      }


      /**
       * Soft edges for the transcript viewport.
       *
       * One inert overlay in the conversation body, two gradient bands, both fed
       * by the scrollport's own metrics:
       *
       *   top     scrollTop > 0 — content is hidden above
       *   bottom  not within 2px of the end — content is hidden below
       *
       * The bottom band is anchored to the composer seat's top edge, measured
       * live, because the seat is a sticky child of the same scroller (see the
       * `scroll-edges` patch). Nothing here runs when the conversation is absent,
       * and everything is removed on dispose.
       */
      function installScrollEdgeFade() {
        const CLASS = 'vt-edge-fade';
        const EPSILON = 2;
        let scroller = null;
        let overlay = null;
        let frame = 0;
        let hostObserver = null;

        const seatOf = (el) => el.lastElementChild || null;

        const paint = () => {
          frame = 0;
          if (!scroller || !overlay || !scroller.isConnected) return;
          // Read first, then write: `paint` also runs while a turn streams, and a
          // write followed by a rect read would force a second layout per frame.
          const max = scroller.scrollHeight - scroller.clientHeight;
          const top = scroller.scrollTop > EPSILON;
          const bottom = max > EPSILON && scroller.scrollTop < max - EPSILON;
          // The band ends where the composer begins: the seat's own 36px gradient
          // is mostly painted behind an opaque card.
          const seat = seatOf(scroller);
          const host = overlay.parentElement;
          const offset = seat && host
            ? Math.max(0, Math.round(host.getBoundingClientRect().bottom - seat.getBoundingClientRect().top))
            : 0;
          if (overlay.dataset.top !== String(top)) overlay.dataset.top = String(top);
          if (overlay.dataset.bottom !== String(bottom)) overlay.dataset.bottom = String(bottom);
          overlay.style.setProperty('--vt-fade-bottom', `${offset}px`);
        };

        const schedule = () => {
          if (frame) return;
          frame = requestAnimationFrame(paint);
        };

        const unbind = () => {
          if (frame) { cancelAnimationFrame(frame); frame = 0; }
          if (scroller) scroller.removeEventListener('scroll', schedule);
          window.removeEventListener('resize', schedule);
          if (overlay) overlay.remove();
          scroller = null;
          overlay = null;
        };

        /**
         * The main transcript is the largest scrollport on screen: the app can
         * render a second conversation (sidebar preview, embedded panel), and
         * taking the first match would fade the wrong one.
         */
        const bind = () => {
          const next = pickTranscriptScroller();
          if (!next || next === scroller || !next.parentElement) return false;
          unbind();
          scroller = next;
          overlay = document.createElement('div');
          overlay.className = CLASS;
          overlay.setAttribute('aria-hidden', 'true');
          overlay.dataset.top = 'false';
          overlay.dataset.bottom = 'false';
          next.parentElement.appendChild(overlay);
          scroller.addEventListener('scroll', schedule, { passive: true });
          window.addEventListener('resize', schedule);
          paint();
          return true;
        };

        bind();

        // The conversation root remounts per session, and the scroller arrives
        // after this behaviour installs. Re-bind on structural changes only; the
        // paint itself is a no-op until the scroller exists.
        hostObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
          if (!scroller || !scroller.isConnected) bind();
          else schedule();
        });
        if (hostObserver) hostObserver.observe(document.body, { childList: true, subtree: true });

        return () => {
          if (hostObserver) hostObserver.disconnect();
          unbind();
        };
      }


      /**
       * Keep the reader's place while an answer streams.
       *
       * The transcript's follow policy is one line — content growth scrolls the
       * tail into view — and it is owned by the chat package. `followTail()` even
       * writes "following" back to `true` after a landing it did not reach, so the
       * freeze cannot be expressed by toggling that state from outside. It has to
       * happen where the tail movement is written: the scrollport's own
       * `scrollTop` / `scrollTo`.
       *
       * The rule (values in `SCROLL_PIN`):
       *
       *   · only while a turn runs AND the turn has actually written text. DSH
       *     exposes no "the answer step started" flag — its process header renders
       *     only after the turn closes, and `data-turn-process-answer` is set after
       *     the live process ends — so the trigger is the first visible assistant
       *     text of the turn. A row created before its text (height 0) is the
       *     thinking phase and follows exactly as shipped; a summary the model
       *     writes mid-turn is text and counts as the start;
       *   · following continues until this turn's own message reaches the top: the
       *     line is the chat list's own `padding-top`, i.e. the distance DSH leaves
       *     above the first message in a fresh session;
       *   · from there on, every follow write is capped at that line, so the row
       *     stays put while the answer grows below it;
       *   · if the row is already above the line when the answer starts (a long
       *     process phase pushed it away), the view is pulled back to it once;
       *   · returning to the tail — the app's `data-chat-following-tail` coming
       *     back, or a smooth "back to latest" — hands the view back for the rest
       *     of the turn. Wheel, touch, pointer and key input never release it.
       *
       * Why the write and not a scroll listener: the app writes the target it
       * wants, reads back the actual `scrollTop` and stores that as its landing,
       * so a capped write stays consistent with its own bookkeeping.
       */
      function installScrollPin(readSelectors, metrics) {
        const SLACK = SCROLL_PIN.slack;

        let scroller = null;
        let restoreWrites = null;
        let flagObserver = null;
        let hostObserver = null;
        let revoke = null;
        let published = '';
        let publishedShape = '';
        let publishedAt = 0;
        let state = null;

        /** One turn's freeze state; reset whenever the user row changes. */
        const blank = () => ({
          key: null,
          turn: null,
          column: null,
          user: null,
          answer: null,
          /** The pin row was chosen for this turn. */
          armed: false,
          /** A write was capped or pulled back at least once. */
          engaged: false,
          /** The reader took the tail back: the rest of this turn follows. */
          released: false,
          /** `user` or `answer` — which row this turn is pinned to. */
          pin: 'user',
          rowTop: null,
          pinTop: null,
          /** The pin row's top on the previous write; detects the crossing frame. */
          prevPinTop: null,
          ceiling: null,
          /** How far the one pull-back went, in px. */
          pulled: 0,
          /** Last requested write and what it became, for the report. */
          requested: null,
          allowed: null,
        });

        /** The chat flow column inside the scrollport. */
        const columnOf = (element) => element.querySelector('[data-chat-flow]');

        /**
         * The native top inset: the chat list's own `padding-top`, which is where
         * the first message of a session sits. Read every time so a change upstream
         * moves the pin with it instead of leaving a stale number behind.
         */
        const offsetOf = (current) => {
          const list = current.column ? current.column.parentElement : null;
          if (!list) return SCROLL_PIN.fallbackOffset;
          const raw = Number.parseFloat(getComputedStyle(list).paddingTop);
          return Number.isFinite(raw) && raw >= 0 ? raw : SCROLL_PIN.fallbackOffset;
        };

        /**
         * Which turn is on screen: its last committed user row and the turn it
         * belongs to. Re-read on every write — a steering message during a turn
         * replaces the row this freeze is pinned to.
         */
        const resolveTurn = () => {
          if (!scroller || !scroller.isConnected) return null;
          const column = columnOf(scroller);
          if (!column) return null;
          const rows = column.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
          let user = null;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            if (rows[i].closest('[hidden]') !== null) continue;
            user = rows[i];
            break;
          }
          if (!user) return null;
          const key = user.getAttribute('data-chat-flow-key') || user.getAttribute('data-chat-turn');
          if (!state || state.key !== key) {
            state = { ...blank(), key, turn: user.getAttribute('data-chat-turn'), column };
          }
          state.column = column;
          state.user = user;
          return state;
        };

        /**
         * The formal answer row of the current turn. It is an `assistant-step`
         * whose group part is "response"; reasoning rows are the same kind marked
         * "reasoning". A plain `assistant` row is accepted for display modes that
         * keep one.
         */
        const resolveAnswer = (current) => {
          if (current.answer && current.answer.isConnected) return current.answer;
          const turn = Number(current.turn);
          if (!Number.isSafeInteger(turn)) return null;
          const nodes = current.column.querySelectorAll(
            `[data-chat-turn="${turn}"][data-chat-group-part="response"], [data-chat-turn="${turn}"][data-chat-flow-kind="assistant"]`,
          );
          for (let i = nodes.length - 1; i >= 0; i -= 1) {
            if (nodes[i].closest('[hidden]') !== null) continue;
            current.answer = nodes[i];
            return nodes[i];
          }
          return null;
        };

        const isRunning = (current) => current.column.querySelector('[data-chat-running]') !== null;

        /** Whether the app currently owns the tail; React mirrors it as an attribute. */
        const isFollowing = (current) => {
          let node = current && current.column;
          for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
            if (node.hasAttribute('data-chat-following-tail')) return true;
          }
          return false;
        };

        /**
         * Publish the freeze through the same two channels the message clamp uses:
         * the engine's metrics (carried into the report tokens) and its own theme
         * layer, because the engine only republishes on body mutations and the
         * reading a human wants to check is taken while the page is static.
         */
        const publish = () => {
          if (!state) return;
          // A write happens on every growth frame, so the numbers move constantly.
          // Publishing each one would swap a theme layer twenty times a second for
          // nothing: emit immediately when the *decision* changes, otherwise at most
          // once a second (the report only ever needs the latest reading).
          const shape = `${state.turn}|${state.pin}|${state.armed ? 1 : 0}|${state.engaged ? 1 : 0}|${state.released ? 1 : 0}|${state.pulled}`;
          const now = Date.now();
          if (shape === publishedShape && now - publishedAt < 1000) return;
          publishedShape = shape;
          publishedAt = now;
          const value = [
            `turn-${state.turn ?? 'none'}`,
            `pin-${state.pin}`,
            `armed-${state.armed ? 1 : 0}`,
            `engaged-${state.engaged ? 1 : 0}`,
            `released-${state.released ? 1 : 0}`,
            `pull-${state.pulled}px`,
            `row-${state.rowTop ?? 'none'}px`,
            `ceil-${state.ceiling ?? 'none'}`,
            `req-${state.requested ?? 'none'}`,
            `ok-${state.allowed ?? 'none'}`,
          ].join('-');
          if (value === published) return;
          published = value;
          metrics['scroll-pin'] = value;
          const tokens = { [`--vt-report-scroll-pin-${sanitize(value)}`]: { light: '', dark: '' } };
          try {
            revoke = ctx.theme.overrideTokens('vt-interface:scroll-pin', tokens);
          } catch (err) { /* diagnostics must never break the visual layer */ }
        };

        /**
         * The live phase, taken from the harness instead of guessed from the DOM.
         *
         * DSH's own definition of "the answer" is retrospective: `latestAnswer()`
         * only accepts the *last* step, settled, with reply content and no tool-call
         * block, and `answerStep` stays null while that step still streams. So there
         * is no "answer started" flag to read.
         *
         * What the harness does publish live is the session event stream: every
         * assistant chunk of the running step arrives as `assistant/live-chunk`
         * with a `chunk.type` of `text-delta`, `reasoning-delta` or
         * `tool-call-delta`. That is the phase, straight from the source: text means
         * the model is writing prose to the reader, anything else means it is still
         * thinking or working.
         *
         * `bind` borrows the UI's retained session (`sessions.binding` does not
         * extend its lifetime) and subscribes read-only. When the service, the
         * session id or the binding is missing, the caller falls back to the
         * rendered-height signal.
         */
        let liveSource = null;

        /** Is the newest assistant activity of this turn text? `null` when unknown. */
        const phaseOf = (entries, turn) => {
          for (let i = entries.length - 1; i >= 0; i -= 1) {
            const entry = entries[i];
            const event = entry && entry.event;
            if (!event || !event.data) continue;
            const eventTurn = Number(event.data.turn);
            if (Number.isSafeInteger(eventTurn) && eventTurn !== turn) continue;
            if (event.type === 'assistant/live-chunk') {
              const chunk = event.data.chunk || {};
              if (chunk.type === 'text-delta') return true;
              if (chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta') return false;
              if (chunk.type === 'block-start') return chunk.blockType === 'text';
              continue;
            }
            if (event.type === 'tool/call' || event.type === 'tool/result') return false;
          }
          return null;
        };

        /** Read the phase now; the window is cheap and always fresher than a cache. */
        const livePhaseNow = (turn) => {
          if (!liveSource || !Number.isSafeInteger(turn)) return null;
          try {
            const window = liveSource.getSnapshot();
            return phaseOf((window && window.entries) || [], turn);
          } catch (err) { return null; }
        };

        const attachLive = () => {
          liveSource = null;
          const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
          if (!sessions || typeof sessions.binding !== 'function' || !scroller) return;
          // The content region is not necessarily a descendant of the scrollport
          // (measured: it is not), so look it up document-wide and prefer the one
          // inside the scrollport when there are several panes.
          const content = (scroller && scroller.querySelector('[data-conversation-content]'))
            || document.querySelector('[data-conversation-content]');
          const id = content && content.getAttribute('data-conversation-session');
          if (!id) return;
          let binding = null;
          try { binding = sessions.binding(id); } catch (err) { binding = null; }
          const source = binding && binding.eventSource;
          if (!source || typeof source.getSnapshot !== 'function') return;
          liveSource = source;
        };

        /**
         * Where a requested scroll should land: the request itself while the pin
         * row is still below the line, the line once it would cross.
         */
        const plan = (requested, smooth) => {
          if (!scroller) return requested;
          const current = resolveTurn();
          if (smooth) {
            // A smooth request is "back to latest" — a reader command, never the
            // growth path, which is always immediate.
            if (current && current.engaged && !current.released) {
              current.released = true;
              current.requested = Math.round(requested);
              current.allowed = Math.round(requested);
              publish();
            }
            return requested;
          }
          if (!current) return requested;
          if (current.released) return requested;
          // A fold batch drives `scrollTop` on its own frame clock to hold visible
          // content still while rows collapse; capping that would fight it.
          if (current.column.hasAttribute('data-input-fold')) return requested;
          const start = scroller.scrollTop;
          // Frozen: hold this position for the rest of the turn *and* for the
          // turn's own closing follow, until the reader takes the tail back.
          // Upward navigation (clicking a turn mark) still goes through.
          if (current.engaged) {
            current.requested = Math.round(requested);
            if (requested < start) {
              current.allowed = Math.round(requested);
              publish();
              return requested;
            }
            current.allowed = Math.round(start);
            publish();
            return start;
          }
          if (!isRunning(current)) return requested;
          const answer = resolveAnswer(current);
          if (!answer) return requested;
          const view = scroller.clientHeight;
          if (view <= 0) return requested;
          // Phase gate. The harness knows whether the running step is emitting text
          // (answer) or reasoning/tool deltas (process); when it cannot be read, the
          // rendered height of the answer row is the fallback — a row created before
          // its text is 0px tall and must follow as shipped.
          const phase = livePhaseNow(Number(current.turn));
          if (phase === false) return requested;
          if (phase === null && answer.getBoundingClientRect().height < 1) return requested;
          const offset = offsetOf(current);
          const row = current.user.getBoundingClientRect();
          // A message taller than the viewport has no reachable pin line; the
          // message clamp folds those rows anyway, so this is a guard, not a path.
          if (row.height > view - offset) return requested;
          const frame = scroller.getBoundingClientRect();
          const first = !current.armed;
          if (first) {
            current.armed = true;
            const rowTop = row.top - frame.top;
            const answerTop = answer.getBoundingClientRect().top - frame.top;
            current.rowTop = Math.round(rowTop);
            // Pinning the user row pushes the answer down by the same amount. When
            // that would leave the answer's first line below the fold, the answer
            // start is what has to stay readable instead.
            current.pin = answerTop - (rowTop - offset) > view - SLACK ? 'answer' : 'user';
          }
          const pinEl = current.pin === 'answer' ? answer : current.user;
          const pinTop = pinEl.getBoundingClientRect().top - frame.top;
          const ceiling = start + (pinTop - offset);
          // The crossing frame: growth has already pushed the row above the line
          // before this write, so a plain "is it below" test would step over it.
          const crossed = current.prevPinTop !== null && current.prevPinTop >= offset && pinTop < offset;
          current.prevPinTop = pinTop;
          current.pinTop = Math.round(pinTop);
          current.ceiling = Math.round(ceiling);
          /**
           * Freeze here. The 1px step is the important part: it is below the eye's
           * threshold but above the scroll sampler's 0.5px tolerance, so the app's
           * own reader sampling concludes "the reader took over" and stops
           * following. Without it the app still believes it owns the tail, and when
           * the turn closes it runs one last follow-to-bottom — the jump this patch
           * exists to remove. With it, the closing fold also stops treating the tail
           * as its target and compensates instead.
           */
          const freeze = (top) => {
            const nudged = Math.max(0, Math.min(top, start - 1));
            current.engaged = true;
            current.requested = Math.round(requested);
            current.allowed = Math.round(nudged);
            publish();
            return nudged;
          };
          if (ceiling >= start || crossed) {
            const next = Math.min(requested, ceiling);
            if (next < requested - 0.5) return freeze(next);
            current.requested = Math.round(requested);
            current.allowed = Math.round(next);
            publish();
            return next;
          }
          // The pin line is above the current position: this turn's message is
          // already out of view (a long process phase pushed it away), or the app
          // wants to move up. Upward requests go through; otherwise freeze where
          // the view is instead of jumping.
          if (requested < start) return requested;
          return first ? freeze(start) : requested;
        };

        /**
         * Shadow the scrollport's own writes with one clamp. Own properties on the
         * instance, never the prototypes: deleting them restores the shipped
         * behaviour and no other element is ever affected.
         */
        const patchWrites = (element) => {
          // Never wrap our own wrapper: `nativeScrollTo` would then be the previous
          // clamp and every write would re-enter `plan`.
          if (element.scrollTo && element.scrollTo.vtScrollPin === true) return () => {};
          const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
          if (!descriptor || typeof descriptor.set !== 'function') {
            // The whole patch is this hook; without it there is nothing to verify by
            // eye either, so it has to be visible in the report.
            metrics['scroll-pin-hook'] = 'no-accessor';
            return () => {};
          }
          metrics['scroll-pin-hook'] = 'installed';
          const read = descriptor.get;
          const write = descriptor.set;
          const nativeScrollTo = element.scrollTo;
          Object.defineProperty(element, 'scrollTop', {
            configurable: true,
            enumerable: false,
            get() { return read.call(element); },
            set(value) { write.call(element, plan(value, false)); },
          });
          element.scrollTo = function scrollTo(options, y) {
            if (typeof options === 'number') {
              return nativeScrollTo.call(element, options, plan(y, false));
            }
            if (!options || options.top === undefined || options.top === null) {
              return nativeScrollTo.call(element, options);
            }
            const top = plan(options.top, options.behavior === 'smooth');
            return nativeScrollTo.call(element, { ...options, top });
          };
          element.scrollTo.vtScrollPin = true;
          return () => {
            delete element.scrollTop;
            delete element.scrollTo;
          };
        };

        /** Following resumed after the freeze released the tail: the reader asked for it. */
        const onFlag = (records) => {
          if (!state || !state.engaged || state.released) return;
          for (const record of records) {
            if (record.attributeName !== 'data-chat-following-tail') continue;
            if (!record.target.hasAttribute('data-chat-following-tail')) continue;
            state.released = true;
            publish();
            return;
          }
        };

        const snapshot = () => {
          if (!scroller) return { bound: false };
          const current = state || blank();
          return {
            bound: true,
            top: Math.round(scroller.scrollTop),
            client: scroller.clientHeight,
            height: scroller.scrollHeight,
            following: isFollowing(current),
            offset: current.column ? offsetOf(current) : SCROLL_PIN.fallbackOffset,
            turn: current.turn,
            pin: current.pin,
            armed: current.armed,
            engaged: current.engaged,
            released: current.released,
            pulled: current.pulled,
            rowTop: current.rowTop,
            pinTop: current.pinTop,
            ceiling: current.ceiling,
            requested: current.requested,
            allowed: current.allowed,
          };
        };

        const unbind = () => {
          if (flagObserver) { flagObserver.disconnect(); flagObserver = null; }
          liveSource = null;
          if (restoreWrites) { restoreWrites(); restoreWrites = null; }
          if (typeof revoke === 'function') safeCall(revoke);
          revoke = null;
          scroller = null;
          state = null;
          published = '';
          publishedShape = '';
          publishedAt = 0;
        };

        const bind = () => {
          const next = pickTranscriptScroller();
          if (!next || next === scroller || !next.parentElement) return false;
          unbind();
          scroller = next;
          restoreWrites = patchWrites(next);
          flagObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(onFlag);
          if (flagObserver) {
            flagObserver.observe(next, { attributes: true, attributeFilter: ['data-chat-following-tail'], subtree: true });
          }
          attachLive();
          return true;
        };

        bind();

        // The conversation view remounts per session, so the scrollport this patch
        // owns is replaced under it. Re-bind on structural changes only.
        hostObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
          if (!scroller || !scroller.isConnected) bind();
        });
        if (hostObserver) hostObserver.observe(document.body, { childList: true, subtree: true });

        scrollPinReadout = snapshot;

        return () => {
          if (hostObserver) hostObserver.disconnect();
          unbind();
          if (scrollPinReadout === snapshot) scrollPinReadout = null;
        };
      }


      /**
       * Hide the floating "back to bottom" button while everything is visible.
       *
       * The button is React's, and its only render condition is "not following the
       * tail" — the geometry is never consulted. This behaviour supplies the
       * missing half: it finds that one button (a button whose parent is the
       * zero-height sticky/absolute slot), decides from the scrollport whether
       * content remains below, and hides or restores it. Nothing else is touched:
       * no node is added, no attribute of the app's is changed.
       */
      function installToBottomVisibility(metrics) {
        let scroller = null;
        let button = null;
        let hidden = false;
        let frame = 0;
        let hostObserver = null;

        const findButton = () => {
          if (!scroller) return null;
          for (const candidate of scroller.querySelectorAll('button')) {
            const parent = candidate.parentElement;
            if (!parent) continue;
            const style = getComputedStyle(parent);
            if (style.position !== 'sticky' && style.position !== 'absolute') continue;
            if (parent.getBoundingClientRect().height > 0) continue;
            return candidate;
          }
          return null;
        };

        const paint = () => {
          frame = 0;
          if (!scroller || !scroller.isConnected) return;
          if (!button || !button.isConnected) button = findButton();
          if (!button) return;
          const max = scroller.scrollHeight - scroller.clientHeight;
          const below = max > 2 && scroller.scrollTop < max - 2;
          if (below === !hidden) {
            metrics['to-bottom'] = `below-${below ? 1 : 0}`;
            return;
          }
          hidden = !below;
          if (hidden) button.style.setProperty('display', 'none', 'important');
          else button.style.removeProperty('display');
          metrics['to-bottom'] = `below-${below ? 1 : 0}`;
        };

        const schedule = () => {
          if (frame) return;
          frame = requestAnimationFrame(paint);
        };

        const unbind = () => {
          if (frame) { cancelAnimationFrame(frame); frame = 0; }
          if (scroller) scroller.removeEventListener('scroll', schedule);
          window.removeEventListener('resize', schedule);
          if (button) button.style.removeProperty('display');
          scroller = null;
          button = null;
          hidden = false;
        };

        const bind = () => {
          const next = pickTranscriptScroller();
          if (!next || next === scroller) return false;
          unbind();
          scroller = next;
          next.addEventListener('scroll', schedule, { passive: true });
          window.addEventListener('resize', schedule);
          paint();
          return true;
        };

        bind();

        // The button mounts and unmounts with React's follow state, and the
        // viewport remounts per session; re-evaluate on structural changes.
        hostObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
          if (!scroller || !scroller.isConnected) bind();
          else schedule();
        });
        if (hostObserver) hostObserver.observe(document.body, { childList: true, subtree: true });

        return () => {
          if (hostObserver) hostObserver.disconnect();
          unbind();
        };
      }


      /**
       * Owns the single injected stylesheet. Styled with the loader's documented
       * markers so the client module loader can reclaim it, and removed on dispose.
       */
      function createStyleHost(ctx) {
        const tag = document.createElement('style');
        tag.dataset.plugin = PLUGIN_ID;
        tag.dataset.pluginCss = `${PLUGIN_ID}/vt-interface.css`;
        document.head.appendChild(tag);
        let current = null;
        return {
          set(css) {
            if (css === current) return;
            current = css;
            tag.textContent = css;
          },
          dispose() {
            tag.remove();
          },
        };
      }

      /**
       * 「轨迹」 entry in the composer's status row.
       *
       * Why a slot: `conversation.composer.dock` is the official list slot that
       * already hosts the turn/step and usage readings. React owns that row, so a
       * hand-inserted sibling is reordered or dropped on the next render; order
       * -1 makes the entry first without touching the shipped two.
       *
       * Why the click targets a hidden tab: switching a view writes twice — the
       * conversation store's `view` field and
       * `uiConversation.binding(sessionId).activate()` — and both live inside the
       * conversation package's closure. No command, shortcut, route or public
       * service reaches them; the tab's own onClick is `selectView`, which is
       * exactly those two writes. Clicking it is the only route that stays out of
       * that package's internals, which is why `view-tabs` leaves the tabs in the
       * DOM instead of unmounting them.
       *
       * Failure surface: without the `slots` service or a `react` module this
       * throws and `__vtInterface.behaviors()` says so; the visual layer is
       * untouched. When the trajectory view is not registered — it is filtered
       * out unless Developer tools are on — no tab exists, so the entry renders
       * nothing rather than a dead control.
       */
      function installViewSwitch(ctx) {
        const slots = ctx.get('slots');
        if (!slots || typeof slots.inject !== 'function') throw new Error('slots service unavailable');
        const React = require('react');

        // Borrow the chat package's pill: same size, icon gap, padding and hover
        // fill as the readings beside it, and it follows the theme for free.
        const discovered = resolveTarget(
          { signature: VIEW_SWITCH.signature, selectorFilter: VIEW_SWITCH.selectorFilter },
          null,
        ) || [];
        const selector = discovered[0] || VIEW_SWITCH.fallback;
        const pill = selector.slice(1);
        const anchor = moduleSibling(selector, 'anchor').slice(1);
        const label = moduleSibling(selector, 'label').slice(1);

        /**
         * The conversation is pinned first (`resolveActiveView` falls back to it),
         * so the entry is simply "the other tab": forward from the conversation,
         * back from the trajectory. Reading that tab's own text keeps the label
         * localized without a translation of our own.
         */
        const readTarget = () => {
          const list = document.querySelector('[data-conversation-tabs]');
          const tabs = list ? Array.from(list.querySelectorAll('button[role="tab"]')) : [];
          if (tabs.length < 2) return null;
          const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
          if (current < 0) return null;
          const index = current === 0 ? 1 : 0;
          const text = (tabs[index].textContent || '').trim();
          if (!text) return null;
          return { index, label: text, forward: index !== 0 };
        };

        const glyph = (paths) => React.createElement('svg', {
          width: VIEW_SWITCH.glyph.box,
          height: VIEW_SWITCH.glyph.box,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: VIEW_SWITCH.glyph.stroke,
          strokeLinecap: 'round',
          'aria-hidden': true,
        }, paths.map((d) => React.createElement('path', { key: d, d })));

        function ViewSwitch() {
          const [target, setTarget] = React.useState(readTarget);
          React.useEffect(() => {
            // Three different things change the answer: our own click, a view
            // restored when a session opens, and the Developer-tools filter coming
            // or going. One coalesced observer covers all three; the delay exists
            // because the transcript mutates continuously while streaming.
            let settle = 0;
            const sync = () => {
              settle = 0;
              const next = readTarget();
              setTarget((previous) => (
                previous && next && previous.index === next.index && previous.label === next.label
                  ? previous
                  : next
              ));
            };
            const observer = new MutationObserver(() => {
              if (settle) return;
              settle = setTimeout(sync, VIEW_SWITCH.settleMs);
            });
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['aria-selected'],
            });
            sync();
            return () => {
              observer.disconnect();
              clearTimeout(settle);
            };
          }, []);

          if (target === null) return null;
          return React.createElement(
            'span',
            { className: anchor, 'data-vt-view-switch': '' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: pill,
                'aria-label': target.label,
                onClick: () => {
                  const list = document.querySelector('[data-conversation-tabs]');
                  const tabs = list ? Array.from(list.querySelectorAll('button[role="tab"]')) : [];
                  if (tabs[target.index]) tabs[target.index].click();
                },
              },
              glyph(target.forward ? VIEW_SWITCH_GLYPH.toTrajectory : VIEW_SWITCH_GLYPH.toConversation),
              React.createElement('span', { className: label }, target.label),
            ),
          );
        }

        return slots.inject('conversation.composer.dock', () => slots.register({
          name: 'conversation.composer.dock',
          id: VIEW_SWITCH.id,
          order: VIEW_SWITCH.order,
        }, ViewSwitch));
      }

      /**
       * Clamp a long user message to 20 rendered rows with a disclosure block.
       *
       * Three constraints shape this more than the feature itself:
       *
       * 1. React owns the bubble's children. Appending leaf nodes is safe as long
       *    as a re-render that drops them is noticed and they are re-added — that
       *    is what the sweep does on every structural mutation. Reparenting or
       *    wrapping React's content would not be safe, so the text is never
       *    moved: the clamp is `max-height` on the bubble, and the disclosure is
       *    a SIBLING of it (trap 10 is why it cannot be inside the clipped box).
       * 2. The decision needs layout, so it is measured, never guessed. An
       *    unclamped bubble's `scrollHeight` is `paddingTop + rows × lineHeight +
       *    paddingBottom`, which answers "longer than 20 rows?" in one read. Then
       *    the clamped bubble is checked against its own overflow: if it does not
       *    actually hide anything (an inline chip inflated a line, or the estimate
       *    rounded up), the clamp is released. A measured post-condition beats a
       *    clever formula.
       * 3. Expansion lives on the node and nowhere else. Session switches,
       *    compaction and hot reloads re-mount rows, and a re-mounted message
       *    comes back folded — a message the reader opened in the previous
       *    session is not a reading position worth restoring, and keeping a
       *    memory for it would be state this plugin has no business holding.
       *
       * Failure surface: a missing chevron icon module or a missing
       * `react-dom/client` throws into `installBehaviors`, which reports it as a
       * failed behaviour instead of leaving half a feature wired.
       */
      function installMessageClamp(readSelectors) {
        const ROW_SELECTOR = '[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]';
        const STATE = 'data-vt-clamp';
        const TOGGLE = 'vt-msg-clamp-toggle';
        const MORE = 'vt-msg-clamp-more';
        const TAIL = 'vt-msg-clamp-tail';
        /** Settle time: the transcript mutates continuously while a turn streams. */
        const SETTLE_MS = 120;

        const React = require('react');
        const reactDom = require('react-dom/client');
        const icons = require('@deepseek-ai/dsh-client-ui-primitives');
        const ChevronDown = icons.IconChevronDownOutlineRegular;
        const ChevronUp = icons.IconChevronUpOutlineRegular;
        if (typeof ChevronDown !== 'function' || typeof ChevronUp !== 'function') {
          throw new Error('chevron icons unavailable in @deepseek-ai/dsh-client-ui-primitives');
        }

        /** Labels follow the app language instead of shipping an English-only row. */
        const locale = ctx.get('locale');
        const translate = (zh, en) => (
          locale && typeof locale.resolveText === 'function' ? locale.resolveText({ zh, en }) : en
        );
        const label = { open: translate('展开', 'Show more'), close: translate('收起', 'Show less') };

        /** Live disclosure entries, so dispose removes exactly what we added. */
        const entries = new Set();
        /** bubble -> entry; a WeakMap keeps dropped rows collectable. */
        const wired = new WeakMap();
        let timer = 0;
        let published = '';
        let revoke = null;

        /** The bubble class resolved by the `user-bubble` patch, else its own fallback. */
        const bubblePatch = patches.components.find((patch) => patch.id === 'user-bubble');
        const bubbleSelector = () => {
          const map = (typeof readSelectors === 'function' && readSelectors()) || {};
          const list = map['user-bubble'];
          if (list && list.length) return list.join(',');
          return (bubblePatch && bubblePatch.fallback) || '';
        };

        /**
         * Rendered row count of an *unclamped* bubble. `scrollHeight` includes
         * the padding, so the padding is subtracted before dividing by the line
         * box — the result is the number of line boxes the browser actually laid
         * out, which is the unit the 20-row rule is defined in.
         */
        const lineCount = (bubble) => {
          const style = getComputedStyle(bubble);
          const lineHeight = parseFloat(style.lineHeight);
          if (!isFinite(lineHeight) || lineHeight <= 0) return 0;
          const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
          return Math.round((bubble.scrollHeight - padding) / lineHeight);
        };

        /** Does the applied clamp actually hide text? */
        const overflows = (bubble) => bubble.clientHeight > 0 && bubble.scrollHeight > bubble.clientHeight + 1;

        /** One chevron, rendered from the app's own icon component. */
        const chevron = (expanded) => {
          const host = document.createElement('span');
          host.className = 'vt-msg-clamp-icon';
          const root = reactDom.createRoot(host);
          const paint = (isOpen) => root.render(React.createElement(isOpen ? ChevronUp : ChevronDown, {
            size: MESSAGE_CLAMP.glyph.box,
            strokeWidth: MESSAGE_CLAMP.glyph.stroke,
          }));
          paint(expanded);
          return { host, paint, dispose: () => root.unmount() };
        };

        /**
         * The clamp's verification channel. Published here rather than only
         * through the engine's report: the engine republishes on body mutations
         * alone, so on an idle page a reading taken right after install would
         * never reach the token list.
         */
        const publish = (rows, bubbles, clamped, expandedCount, first, scan) => {
          const fields = {
            messages: `rows-${rows} bubbles-${bubbles} clamped-${clamped} expanded-${expandedCount}`,
          };
          if (scan && scan.length) fields['messages-scan'] = scan.join(' ');
          if (first) {
            const style = getComputedStyle(first.bubble);
            fields['messages-first'] = [
              `lines-${first.lines}`,
              `max-${style.maxHeight || 'none'}`,
              `h-${first.bubble.clientHeight}`,
              `scroll-${first.bubble.scrollHeight}`,
              `pb-${style.paddingBottom}`,
              `lh-${style.lineHeight}`,
              `box-${style.boxSizing}`,
            ].join('-');
          }
          const signature = JSON.stringify(fields);
          if (signature === published) return;
          published = signature;
          const tokens = {};
          for (const [key, value] of Object.entries(fields)) {
            tokens[`--vt-report-${sanitize(key)}-${sanitize(value)}`] = { light: '', dark: '' };
          }
          try {
            revoke = ctx.theme.overrideTokens('vt-interface:messages', tokens);
          } catch (err) { /* diagnostics must never break the visual layer */ }
        };

        const unwire = (bubble, entry) => {
          entries.delete(entry);
          wired.delete(bubble);
          try { entry.icon.dispose(); } catch (err) { /* already gone */ }
          entry.tail.remove();
          bubble.removeAttribute(STATE);
          bubble.removeAttribute('data-vt-clamp-lines');
        };

        const wire = (bubble, lines) => {
          const more = document.createElement('span');
          more.className = MORE;
          more.setAttribute('aria-hidden', 'true');
          more.textContent = '…';

          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = TOGGLE;
          const caption = document.createElement('span');
          caption.className = 'vt-msg-clamp-label';
          const icon = chevron(false);
          toggle.appendChild(caption);
          toggle.appendChild(icon.host);

          /*
           * The disclosure is a SIBLING of the bubble, never a child: the clamp
           * uses `overflow: hidden`, which clips at the padding box, so any row
           * reserved inside the bubble would still be painted over by the text
           * that overflows the content box.
           */
          const tail = document.createElement('div');
          tail.className = TAIL;
          tail.appendChild(more);
          tail.appendChild(toggle);

          const entry = { bubble, tail, toggle, more, icon, caption, lines, expanded: false };

          const paint = () => {
            bubble.setAttribute(STATE, entry.expanded ? 'expanded' : 'clamped');
            bubble.setAttribute('data-vt-clamp-lines', String(entry.lines));
            toggle.setAttribute('aria-expanded', String(entry.expanded));
            caption.textContent = entry.expanded ? label.close : label.open;
            icon.paint(entry.expanded);
          };

          toggle.addEventListener('click', (event) => {
            // The transcript row has its own click affordances; a disclosure is
            // not one of them.
            event.preventDefault();
            event.stopPropagation();
            entry.expanded = !entry.expanded;
            paint();
            schedule();
          });

          bubble.after(tail);
          entries.add(entry);
          wired.set(bubble, entry);
          paint();
          return entry;
        };

        const sweep = () => {
          timer = 0;
          // A row that left the document must release its nodes and its React
          // root instead of waiting for dispose.
          for (const entry of [...entries]) {
            if (entry.bubble.isConnected) continue;
            entries.delete(entry);
            try { entry.icon.dispose(); } catch (err) { /* already gone */ }
            entry.tail.remove();
          }

          const rows = document.querySelectorAll(ROW_SELECTOR);
          const bubbles = [];
          for (const row of rows) {
            let found;
            try { found = row.querySelectorAll(bubbleSelector()); } catch (err) { found = []; }
            for (const bubble of found) bubbles.push(bubble);
          }

          let clamped = 0;
          let expandedCount = 0;
          let first = null;
          const scan = [];

          for (const bubble of bubbles) {
            let entry = wired.get(bubble) || null;
            // A re-render can drop our nodes while keeping the bubble: rebuild.
            if (entry && !entry.tail.isConnected) {
              unwire(bubble, entry);
              entry = null;
            }
            if (!entry) {
              if (bubble.getAttribute(STATE) === 'none') continue;
              const lines = lineCount(bubble);
              if (scan.length < 4) {
                scan.push(`${lines}L/${bubble.clientHeight}h/${bubble.scrollHeight}s/${bubble.getAttribute(STATE) || '-'}`);
              }
              if (lines <= 0) continue;
              if (lines <= MESSAGE_CLAMP.rows) {
                bubble.setAttribute(STATE, 'none');
                continue;
              }
              entry = wire(bubble, lines);
              // Measured post-condition: keep the clamp only if it hides text.
              if (!entry.expanded && !overflows(bubble)) {
                unwire(bubble, entry);
                bubble.setAttribute(STATE, 'none');
                continue;
              }
            }
            if (entry.expanded) expandedCount += 1;
            else {
              clamped += 1;
              if (!first) first = entry;
            }
          }

          publish(rows.length, bubbles.length, clamped, expandedCount, first, scan);
        };

        const schedule = () => {
          if (timer) return;
          timer = setTimeout(sweep, SETTLE_MS);
        };

        // A language switch relabels every visible disclosure row.
        const relabel = () => {
          label.open = translate('展开', 'Show more');
          label.close = translate('收起', 'Show less');
          for (const entry of entries) entry.caption.textContent = entry.expanded ? label.close : label.open;
        };
        const unsubscribe = locale && typeof locale.subscribe === 'function' ? locale.subscribe(relabel) : null;

        const observer = typeof MutationObserver === 'undefined'
          ? null
          : new MutationObserver(schedule);
        if (observer) observer.observe(document.body, { childList: true, subtree: true });

        sweep();

        return () => {
          clearTimeout(timer);
          if (observer) observer.disconnect();
          if (typeof unsubscribe === 'function') unsubscribe();
          for (const entry of [...entries]) {
            entries.delete(entry);
            try { entry.icon.dispose(); } catch (err) { /* already gone */ }
            entry.tail.remove();
          }
          for (const bubble of document.querySelectorAll(`[${STATE}]`)) bubble.removeAttribute(STATE);
          for (const bubble of document.querySelectorAll('[data-vt-clamp-lines]')) {
            bubble.removeAttribute('data-vt-clamp-lines');
          }
          if (typeof revoke === 'function') safeCall(revoke);
        };
      }

      /**
       * Behaviour implementations, keyed by the name a patch declares.
       *
       * The data section names the intent (`behavior: 'native-tooltip'`); only this
       * layer knows what that costs in DOM work. Wiring a function reference into
       * the data instead would mean the data section has to reach into this
       * closure — the exact coupling this layer exists to prevent.
       */
      const BEHAVIORS = {
        'native-tooltip': (readSelectors) => installNativeTitleTakeover(readSelectors),
        'scroll-edges': () => installScrollEdgeFade(),
        'scroll-pin': (readSelectors, metrics) => installScrollPin(readSelectors, metrics),
        'to-bottom-visibility': (readSelectors, metrics) => installToBottomVisibility(metrics),
        'view-switch': () => installViewSwitch(ctx),
        'message-clamp': (readSelectors) => installMessageClamp(readSelectors),
      };

      return {
        /** One Theme call per token patch; the service revokes on dispose. */
        applyTokenPatches() {
          for (const patch of patches.tokens) {
            try { disposers.push(applyTokens(patch, ctx)); } catch (err) { /* keep going */ }
          }
        },

        /**
         * Re-resolve every component patch, rewrite the injected sheet, and
         * republish the report. Returns the state the engine must remember.
         */
        sync(extra) {
          const { css, status, selectors } = renderComponents(patches.components);
          const behaviorCss = patches.behaviors.map((p) => (p.css ? p.css() : '')).join('\n');
          ensureSheet().set([
            ...patches.variables.map(renderVariables),
            css,
            behaviorCss,
            extra,
          ].join('\n'));
          publishReport(ctx, status, selectors);
          return { status, selectors };
        },

        /**
         * Behaviours install after the first sync: they need resolved selectors.
         * The getter keeps them live across re-resolutions instead of freezing
         * the first answer.
         */
        installBehaviors(readSelectors) {
          let installed = 0;
          for (const patch of patches.behaviors) {
            try {
              const factory = BEHAVIORS[patch.behavior];
              if (typeof factory !== 'function') throw new Error(`unknown behaviour "${patch.behavior}"`);
              disposers.push(factory(readSelectors, behaviorMetrics));
              installed += 1;
            } catch (err) {
              // A behaviour that throws must not take the visual layer down, but
              // it must be visible: silently swallowing it looks like "no effect".
              behaviorErrors.push(`${patch.id}: ${err && err.message ? err.message : String(err)}`);
            }
          }
          // Encoded into report tokens, so a failed install is also readable
          // without DevTools (see the `behaviors` field in docs/VERIFY.md).
          behaviorMetrics.behaviors = `${installed}-of-${patches.behaviors.length}`;
          if (behaviorErrors.length > 0) behaviorMetrics['behaviour-errors'] = behaviorErrors.join(' | ');
          return { installed, total: patches.behaviors.length, errors: behaviorErrors };
        },

        /** Why behaviours failed; empty when all of them installed. */
        behaviorErrors() {
          return [...behaviorErrors];
        },

        /** Live readings a behaviour publishes for the report channel. */
        behaviorMetrics() {
          return { ...behaviorMetrics };
        },

        /**
         * Live state of the reading-position freeze (`scroll-pin`): whether it is
         * bound, which row this turn pinned to, and the numbers it acted on. Null
         * until the behaviour installs or before a conversation mounts.
         */
        scrollPin() {
          return typeof scrollPinReadout === 'function' ? scrollPinReadout() : null;
        },

        dispose() {
          if (sheet) sheet.dispose();
          for (const d of disposers.reverse()) safeCall(d);
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROBE — opt-in forensics. OFF by default; nothing below runs unless
    // PROBE_ENABLED is flipped on the disk copy (hot reload applies it) or
    // `__vtInterface.probe(true)` is called at runtime.
    //
    // When on, it posts live measurements of the real DOM to a local receiver:
    //   node ./tools/dump-receiver.mjs     (listens on 127.0.0.1:8899)
    // It exists because some questions ("did the patch win the cascade on THIS
    // element?") cannot be answered from stylesheet text — only from computed
    // style. The always-on report channel (`publishReport`) stays available
    // with the probe off.
    //
    // Off by default because a UI patch should ship no timers, listeners or
    // network egress it does not need.
    // ═══════════════════════════════════════════════════════════════════════

    const PROBE_ENABLED = false;
    const DUMP_URL = 'http://127.0.0.1:8899/vt';
    const VT_PROPS = ['border-radius', 'background', 'background-color', 'box-shadow', 'corner-shape', 'width', 'height', 'padding'];

    function postDump(payload) {
      try {
        const body = JSON.stringify(payload);
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon(DUMP_URL, new Blob([body], { type: 'text/plain' }));
          return;
        }
        fetch(DUMP_URL, { method: 'POST', body, mode: 'no-cors', headers: { 'content-type': 'text/plain' } }).catch(() => {});
      } catch (err) { /* diagnostics must never break the app */ }
    }

    /** Drop interaction pseudo-classes so a rule can be matched while at rest. */
    function vtDehover(selector) {
      return selector.replace(/::?(hover|focus-visible|focus-within|active)\b/g, '');
    }

    /** Every rule that would paint this element in a hover/active state. */
    function vtHoverRules(el) {
      const hits = [];
      let order = 0;
      for (const sheet of collectStyleSheets()) {
        let rules;
        try { rules = sheet.cssRules; } catch (err) { continue; }
        if (!rules) continue;
        const owner = sheet.href
          || (sheet.ownerNode && sheet.ownerNode.dataset && sheet.ownerNode.dataset.pluginCss)
          || 'inline';
        for (const rule of Array.from(rules)) {
          order += 1;
          if (rule.type !== 1) continue;
          const sel = rule.selectorText || '';
          if (!/(:hover|:focus-visible|:active)/.test(sel)) continue;
          const matched = sel.split(',').some((part) => {
            const bare = vtDehover(part).trim();
            if (!bare) return false;
            try { return el.matches(bare); } catch (err) { return false; }
          });
          if (!matched) continue;
          const decls = [];
          for (const prop of VT_PROPS) {
            const value = rule.style.getPropertyValue(prop);
            if (value) decls.push(`${prop}:${value}${rule.style.getPropertyPriority(prop) ? '!' : ''}`);
          }
          if (!decls.length) continue;
          hits.push({ order, owner, sel: sel.slice(0, 110), decls });
        }
      }
      return hits;
    }

    /**
     * Real glyph ink for the element's text, measured in the element's own font.
     *
     * `getBoundingClientRect` only reports the line box, which is identical for
     * every control in a row and therefore useless for "why does this text look
     * bigger". Canvas `actualBoundingBox*` reports the painted extent instead.
     */
    function vtInk(el) {
      const text = (el.textContent || '').trim();
      if (!text) return '';
      try {
        const cs = getComputedStyle(el);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = ctx.measureText(text);
        const up = Math.round(m.actualBoundingBoxAscent);
        const down = Math.round(m.actualBoundingBoxDescent);
        return `up${up}/down${down}/w${Math.round(m.width)}`;
      } catch (err) { return ''; }
    }

    function vtDescribe(el) {
      if (!el || el.nodeType !== 1) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const out = {
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class') || '',
        label: el.getAttribute('aria-label') || el.getAttribute('title') || '',
        text: (el.textContent || '').trim().slice(0, 40),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 90),
        radius: cs.borderRadius,
        cornerShape: cs.getPropertyValue('corner-shape') || '',
        shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 140),
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        opacity: cs.opacity,
        z: cs.zIndex,
        pos: cs.position,
        overflow: cs.overflow,
        left: cs.left,
        translate: cs.translate,
        anchorName: cs.getPropertyValue('anchor-name') || '',
        positionAnchor: cs.getPropertyValue('position-anchor') || '',
        font: `${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}`,
        family: String(cs.fontFamily).split(',')[0].replace(/["']/g, ''),
        tracking: cs.letterSpacing,
        color: cs.color,
        ink: vtInk(el),
        // Icon geometry: with no plate behind it, a glyph is judged alone, so the
        // size and stroke of the first svg have to be numbers, not "looks small".
        svg: (() => {
          const icon = el.querySelector('svg');
          if (!icon) return null;
          const ir = icon.getBoundingClientRect();
          const shape = icon.querySelector('path, line, rect, circle, polyline');
          const stroke = shape ? getComputedStyle(shape).strokeWidth : '?';
          const inkRect = shape ? shape.getBoundingClientRect() : null;
          const ink = inkRect ? `${Math.round(inkRect.width)}x${Math.round(inkRect.height)}` : '?';
          return `${Math.round(ir.width)}x${Math.round(ir.height)} stroke=${stroke} ink=${ink}`;
        })(),
      };
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(el, pseudo);
        if (!p.content || p.content === 'none') continue;
        out[pseudo] = `${p.content}|${p.backgroundColor}|${p.borderRadius}|${p.width}x${p.height}|${p.inset}`;
      }
      return out;
    }

    /**
     * CJK vs Latin ink at the composer's own font and size.
     *
     * `font-size` is the em box, not how big a glyph looks. Ideographs fill most
     * of the em vertically; Latin lowercase only fills the x-height. Measuring
     * both with the same font quantifies the difference instead of asserting it.
     */
    function vtFontMetrics() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
        const out = { family };
        for (const weight of ['400', '500']) {
          ctx.font = `${weight} 13px ${family}`;
          const cjk = ctx.measureText('自动审查');
          out[`w${weight}`] = {
            cjkUp: Math.round(cjk.actualBoundingBoxAscent),
            cjkWidthPerChar: +(cjk.width / 4).toFixed(1),
            lowerX: Math.round(ctx.measureText('e').actualBoundingBoxAscent),
            capHeight: Math.round(ctx.measureText('D').actualBoundingBoxAscent),
          };
        }
        return out;
      } catch (err) { return null; }
    }

    /** Which stylesheet hosts the given class — document list or adopted sheet? */
    function vtSheetScan(needles) {
      const sheets = collectStyleSheets();
      const found = {};
      for (const needle of needles) found[needle] = 0;
      walkRules(sheets, (rule) => {
        for (const needle of needles) {
          if (rule.selectorText.includes(needle)) found[needle] += 1;
        }
      });
      return {
        total: sheets.length,
        document: document.styleSheets.length,
        adopted: (document.adoptedStyleSheets || []).length,
        found,
      };
    }

    /**
     * Geometry of the turn rail and the gutter it has to live in: the strip, the
     * pane it is positioned against, and where the transcript column starts. The
     * last number decides whether a left-hand rail sits in the margin or lands on
     * top of the text.
     */
    function vtRail() {
      const markEl = document.querySelector('button[data-index]');
      const frame = markEl && markEl.closest('nav');
      if (!frame) return null;
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: Math.round(r.left),
          y: Math.round(r.top),
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          padding: cs.padding,
          margin: cs.margin,
        };
      };
      const pane = frame.parentElement;
      // The transcript column: the readable content this rail must not cover.
      const chatRoot = pane ? pane.querySelector('[data-chat-following-tail]') || pane.querySelector('[class*="_root"]') : null;
      // Transcript text: every text block currently rendered in the pane, so the
      // leftmost ink is the number the rail has to clear.
      const blocks = [...document.querySelectorAll('p, li, h1, h2, h3')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.top > 60 && r.bottom < window.innerHeight - 120 && (el.textContent || '').trim().length > 8;
      });
      const lefts = blocks.map((el) => Math.round(el.getBoundingClientRect().left)).sort((a, b) => a - b);
      const block = blocks[0] || null;
      const composer = document.querySelector('[class*="_card"]');
      const sidebar = document.querySelector('aside, [class*="sidebar"]');
      const frameStyle = getComputedStyle(frame);
      const bar = getComputedStyle(markEl, '::before');
      return {
        count: frame.querySelectorAll('button[data-index]').length,
        // Wave rules must survive the parser: a dropped :has() selector would
        // look like "the new CSS simply did nothing".
        wave: (() => {
          const tag = document.querySelector('style[data-plugin-css$="vt-interface.css"]');
          const sheet = tag && tag.sheet;
          if (!sheet) return null;
          let rules = 0;
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes(':has(+')) rules += 1;
          }
          return {
            parsedHasRules: rules,
            supportsHas: CSS.supports('selector(.a:has(+ .b:hover))'),
          };
        })(),
        frame: box(frame),
        frameStyle: {
          left: frameStyle.left,
          right: frameStyle.right,
          top: frameStyle.top,
          width: frameStyle.width,
          maxHeight: frameStyle.maxHeight,
          transform: frameStyle.transform,
        },
        pane: box(pane),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        sidebar: box(sidebar),
        paneClass: pane ? String(pane.className).slice(0, 60) : null,
        parentClass: pane && pane.parentElement ? String(pane.parentElement.className).slice(0, 60) : null,
        chatRoot: box(chatRoot),
        text: box(block),
        textLeft: block ? Math.round(block.getBoundingClientRect().left) : null,
        inkLefts: lefts.slice(0, 5),
        composer: box(composer),
        mark: box(markEl),
        bar: {
          width: bar.width,
          height: bar.height,
          transform: bar.transform,
          background: bar.backgroundColor,
          radius: bar.borderRadius,
          transition: bar.transition,
        },
        preview: (() => {
          const el = frame.querySelector('[class*="_preview_"], [class*="_preview"]');
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            ...box(el),
            style: {
              padding: cs.padding,
              radius: cs.borderRadius,
              background: cs.backgroundColor,
              shadow: cs.boxShadow.slice(0, 90),
              width: cs.width,
              maxHeight: cs.maxHeight,
              transition: cs.transition.slice(0, 60),
            },
            promptFont: (() => {
              const line = el.querySelector('[class*="_previewPrompt"]');
              if (!line) return null;
              const ls = getComputedStyle(line);
              return `${ls.fontSize}/${ls.lineHeight} w${ls.fontWeight}`;
            })(),
          };
        })(),
      };
    }

    /**
     * The conversation viewport: what clips the transcript, what is sticky over
     * it, and whether either edge already fades. "Hard cut" is a statement about
     * these boxes, so measure them before styling anything.
     */
    function vtConvo() {
      const scroller = document.querySelector('[data-conversation-scroll]');
      if (!scroller) return null;
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          y: Math.round(r.top),
          h: Math.round(r.height),
          x: Math.round(r.left),
          w: Math.round(r.width),
          mask: cs.maskImage === 'none' ? null : cs.maskImage.slice(0, 90),
          background: cs.backgroundImage === 'none' ? cs.backgroundColor : cs.backgroundImage.slice(0, 110),
          position: cs.position,
          overflow: `${cs.overflowY}/${cs.overflowX}`,
          z: cs.zIndex,
        };
      };
      const seat = scroller.querySelector('[data-conversation-composer-overlay], [class*="composerSeat"]');
      const view = scroller.querySelector('[data-slot="conversation.session"], [class*="viewArea"]');
      const cs = getComputedStyle(scroller);
      return {
        cls: String(scroller.className).slice(0, 40),
        scroll: {
          top: Math.round(scroller.scrollTop),
          height: Math.round(scroller.scrollHeight),
          client: scroller.clientHeight,
          atTop: scroller.scrollTop <= 0,
          atBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1,
        },
        scroller: { ...box(scroller), padding: cs.padding },
        seat: seat ? { ...box(seat), padding: getComputedStyle(seat).padding } : null,
        seatKids: seat ? [...seat.children].slice(0, 3).map((el) => ({ cls: String(el.className).slice(0, 36), ...box(el) })) : [],
        view: box(view),
        phase: document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null,
        fade: (() => {
          const el = document.querySelector('.vt-edge-fade');
          if (!el) return null;
          const top = getComputedStyle(el, '::before');
          const bottom = getComputedStyle(el, '::after');
          return {
            top: el.dataset.top,
            bottom: el.dataset.bottom,
            z: getComputedStyle(el).zIndex,
            bandTop: { height: top.height, opacity: top.opacity },
            bandBottom: { height: bottom.height, opacity: bottom.opacity, offset: getComputedStyle(el).getPropertyValue('--vt-fade-bottom').trim() },
          };
        })(),
      };
    }

    /**
     * The reading-position freeze, as numbers.
     *
     * `state` comes from the behaviour itself (`__vtInterface.scrollPin()`) so the
     * probe reports the decision that was actually taken instead of re-deriving
     * one. The rest is DOM geometry: where this turn's user row and its answer row
     * sit right now, and whether a turn is still running.
     */
    function vtScrollPin() {
      const all = [...document.querySelectorAll('[data-conversation-scroll]')];
      const visible = all.filter((el) => el.clientHeight > 0 && el.parentElement);
      const scroller = visible.length === 0
        ? null
        : visible.reduce((best, el) => (el.clientHeight > best.clientHeight ? el : best));
      if (!scroller) return null;
      const column = scroller.querySelector('[data-chat-flow]');
      const frame = scroller.getBoundingClientRect();
      const box = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { top: Math.round(rect.top - frame.top), height: Math.round(rect.height) };
      };
      let following = false;
      let user = null;
      let answer = null;
      let turn = null;
      if (column) {
        for (let node = column, i = 0; node && i < 6; node = node.parentElement, i += 1) {
          if (node.hasAttribute('data-chat-following-tail')) { following = true; break; }
        }
        const rows = [...column.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]')]
          .filter((el) => el.closest('[hidden]') === null);
        user = rows.length === 0 ? null : rows[rows.length - 1];
        const value = user ? Number(user.getAttribute('data-chat-turn')) : NaN;
        if (Number.isSafeInteger(value)) {
          turn = value;
          const answers = [...column.querySelectorAll(`[data-chat-turn="${value}"][data-chat-flow-kind="assistant"]`)]
            .filter((el) => el.closest('[hidden]') === null);
          answer = answers.length === 0 ? null : answers[answers.length - 1];
        }
      }
      return {
        scroll: { top: Math.round(scroller.scrollTop), client: scroller.clientHeight, height: scroller.scrollHeight },
        following,
        running: column ? column.querySelector('[data-chat-running]') !== null : false,
        turn,
        user: box(user),
        answer: box(answer),
        state: window.__vtInterface && window.__vtInterface.scrollPin
          ? window.__vtInterface.scrollPin()
          : null,
      };
    }

    function vtPath(el, depth) {
      const parts = [];
      let node = el;
      for (let i = 0; node && i < depth; i += 1, node = node.parentElement) {
        const cls = String(node.className || '').split(/\s+/).filter(Boolean).join('.');
        parts.push(`${node.tagName.toLowerCase()}${cls ? '.' + cls.slice(0, 70) : ''}`);
      }
      return parts.join(' < ');
    }

    /** Static inventory, or hovered-element forensics when `target` is given. */
    function vtCollect(readState, kind, target) {
      // The composer is the card that owns the text input; other components
      // also use `_card`, so anchor discovery on the input instead.
      const inputEl = document.querySelector('textarea, [contenteditable="true"]');
      const cardEl = (inputEl && inputEl.closest('[class*="_card"]'))
        || document.querySelector('[class*="_card"]');
      const payload = { kind, at: new Date().toISOString(), href: location.href };
      if (cardEl) {
        payload.card = vtDescribe(cardEl);
        payload.controls = [];
        for (const el of Array.from(cardEl.querySelectorAll('button, [class*="_trigger"], [class*="_activity"]'))) {
          const d = vtDescribe(el);
          if (!d || d.size.startsWith('0x0')) continue;
          d.hoverRules = vtHoverRules(el).slice(0, 8);
          payload.controls.push(d);
          if (payload.controls.length >= 26) break;
        }
        payload.myCss = Array.from(document.querySelectorAll('style[data-plugin-css]'))
          .filter((node) => String(node.dataset.pluginCss || '').startsWith(`${PLUGIN_ID}/`))
          .map((node) => node.textContent || '')
          .join('\n')
          .slice(0, 16000);
      }
      // Resolved selectors and patch states, handed in by the engine: the ground
      // truth for "which element did this patch actually land on".
      const state = readState() || {};
      payload.selectors = state.selectors || {};
      payload.patches = {};
      for (const [id, value] of Object.entries(state.status || {})) {
        payload.patches[id] = String(value);
      }
      // Read back the tokens this plugin owns, so a theme-layer change can be
      // verified without opening the surface that consumes it.
      const bodyStyle = getComputedStyle(document.body);
      payload.tokens = {};
      for (const name of [
        '--dsw-menu-surface-fill', '--dsw-specific-menu', '--dsw-menu-backdrop-filter',
        '--dsw-elevation-prominent', '--dsw-elevation-soft',
      ]) {
        payload.tokens[name] = bodyStyle.getPropertyValue(name).trim();
      }
      // Capability check: CSS anchor positioning decides whether popover
      // alignment can be corrected in CSS or needs a JS hook.
      try {
        payload.support = {
          anchorName: CSS.supports('anchor-name: --vt-probe'),
          positionAnchor: CSS.supports('position-anchor: --vt-probe'),
          anchorFn: CSS.supports('left: anchor(center)'),
          translatePct: CSS.supports('translate: -50% 0'),
          hasSelector: CSS.supports('selector(:has(*))'),
        };
      } catch (err) { payload.support = null; }
      // Native titles should be gone from the composer once the takeover runs.
      payload.titles = cardEl ? cardEl.querySelectorAll('[title]').length : -1;
      payload.titlesDoc = document.querySelectorAll('[title]').length;
      // The view switcher sits below the composer card, so the card snapshot
      // cannot see it. Two separate claims need two readings: the header height
      // proves the tab row gave its space back, and the dock entry proves the
      // slot registration landed and is first.
      //
      // The tab row is located through this plugin's own resolution rather than a
      // substring class name: `view-tabs` already discovered it, and
      // `[class*="_tabs"]` is the broad selector trap 4 exists to prevent.
      const headerEl = document.querySelector('header[data-window-drag]');
      const tabRow = document.querySelector('[data-conversation-tabs]');
      const tabsSelector = (payload.selectors['view-tabs'] || []).join(',');
      const tabsWrap = tabsSelector ? document.querySelector(tabsSelector) : null;
      const dockEl = document.querySelector('[data-composer-dock]');
      const entryEl = dockEl ? dockEl.querySelector('[data-vt-view-switch]') : null;
      const entryButton = entryEl ? entryEl.querySelector('button') : null;
      payload.viewSwitch = {
        header: headerEl ? Math.round(headerEl.getBoundingClientRect().height) : null,
        tabs: tabsWrap && tabRow
          ? {
            height: Math.round(tabsWrap.getBoundingClientRect().height),
            active: (tabRow.querySelector('[aria-selected="true"]') || {}).textContent || null,
            labels: Array.from(tabRow.querySelectorAll('button[role="tab"]')).map((tab) => (tab.textContent || '').trim()),
          }
          : null,
        entry: entryButton
          ? { ...vtDescribe(entryButton), text: (entryButton.textContent || '').trim(), aria: entryButton.getAttribute('aria-label') }
          : null,
        dock: dockEl
          ? Array.from(dockEl.querySelectorAll('[data-composer-stat], [data-vt-view-switch]'))
            .map((node) => (node.textContent || '').trim().slice(0, 24))
          : null,
      };
      // The queue panel only exists while a message is waiting for a busy agent,
      // so this reads null most of the time — send one, then take a `manual` dump.
      // `fill` is the ::before background, which is what actually paints it.
      const queueDock = document.querySelector('[data-queue-dock]');
      const queuePanel = queueDock ? queueDock.firstElementChild : null;
      payload.queue = queuePanel
        ? {
          cls: String(queuePanel.className || ''),
          fill: getComputedStyle(queuePanel, '::before').backgroundColor,
          token: getComputedStyle(queuePanel).getPropertyValue('--vt-queue-fill').trim(),
        }
        : null;
      payload.behavior = window.__vtInterface && window.__vtInterface.behaviors
        ? window.__vtInterface.behaviors()
        : null;
      payload.tipCss = false;
      walkRules(collectStyleSheets(), (rule) => {
        if ((rule.selectorText || '').includes('.vt-interface-tip')) payload.tipCss = true;
      });
      const tipEl = document.querySelector('.vt-interface-tip');
      payload.tip = tipEl
        ? { visible: tipEl.getAttribute('data-visible'), text: (tipEl.textContent || '').slice(0, 60) }
        : null;
      payload.metrics = vtFontMetrics();
      payload.rail = vtRail();
      payload.convo = vtConvo();
      payload.scrollPin = vtScrollPin();
      payload.sheets = vtSheetScan(['pn0E2q_trigger', 'kKSgSq_chip', '_ghost_1rv3m_', 'SJRB_q_trigger']);
      // Every rule we emit carries !important; nothing shipped upstream does in
      // the same place. Reading them back proves the sheet's real selectors and
      // therefore its blast radius.
      payload.sheetRules = [];
      walkRules(collectStyleSheets(), (rule) => {
        if (rule.selectorText.includes('_panel') && /min-width:\s*min\(300px/.test(rule.style.cssText || '')) {
          payload.sheetRules.push(`SCAN ${rule.selectorText} => ${(rule.style.cssText || '').replace(/\s+/g, ' ').slice(0, 260)}`);
        }
        if (rule.style.getPropertyPriority('corner-shape') !== 'important') return;
        payload.sheetRules.push(`${rule.selectorText.replace(/\s+/g, ' ')} => ${(rule.style.cssText || '').replace(/\s+/g, ' ').slice(0, 300)}`);
      });
      if (target && target.nodeType === 1) {
        payload.hovered = vtDescribe(target);
        payload.hoveredPath = vtPath(target, 5);
        payload.hoveredHoverRules = vtHoverRules(target);
        payload.chain = [];
        let node = target;
        for (let i = 0; node && i < 5 && node !== cardEl; i += 1, node = node.parentElement) {
          payload.chain.push(vtDescribe(node));
        }
      }
      // Numeric verdict for "is this panel centred over its trigger". The anchor
      // is looked up through the panel's own `position-anchor`, so this works for
      // every dialog the plugin re-centres without naming any of them here.
      if (target && target.nodeType === 1 && target.getAttribute('role') === 'dialog') {
        let active = null;
        const anchorToken = getComputedStyle(target).getPropertyValue('position-anchor').trim();
        if (anchorToken && anchorToken !== 'auto' && anchorToken !== 'none') {
          const candidates = document.querySelectorAll('[class*="_root"], [data-composer-stat]');
          active = Array.from(candidates).find(
            (el) => getComputedStyle(el).getPropertyValue('anchor-name').includes(anchorToken),
          ) || null;
        }
        if (active) {
          const ar = active.getBoundingClientRect();
          const pr = target.getBoundingClientRect();
          payload.alignment = {
            anchorRect: `${Math.round(ar.width)}x${Math.round(ar.height)}@${Math.round(ar.left)}`,
            panelRect: `${Math.round(pr.width)}x${Math.round(pr.height)}@${Math.round(pr.left)}`,
            anchorCenter: Math.round(ar.left + ar.width / 2),
            panelCenter: Math.round(pr.left + pr.width / 2),
            delta: Math.round(pr.left + pr.width / 2 - (ar.left + ar.width / 2)),
            anchorName: getComputedStyle(active).getPropertyValue('anchor-name'),
          };
        }
      }
      postDump(payload);
      return payload;
    }

    /**
     * Owns every probe timer, listener and observer, so the engine only ever
     * calls one thing. `readState` hands over the engine's live resolution
     * (`{ status, selectors }`) instead of the probe reaching back into the
     * diagnostics object — the dependency arrow points one way.
     */
    function createProbe(readState) {
      const timeouts = [];
      const disposers = [];
      const collect = (kind, target) => {
        try { return vtCollect(readState, kind, target); } catch (err) { return null; }
      };

      // 1. One inventory once the composer has mounted.
      timeouts.push(setTimeout(() => collect('static'), 2500));



      // 2. Forensics for whatever the pointer lands on inside the composer. Wait
      //    for :hover to settle; the pointer is still on the element by then.
      let hoverTimer;
      const onHover = (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        const cardEl = document.querySelector('[class*="_card"]');
        if (!cardEl || !cardEl.contains(target)) return;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => collect('hover', target), 90);
      };
      document.addEventListener('mouseover', onHover, true);
      disposers.push(() => document.removeEventListener('mouseover', onHover, true));

      // 2b. The rail's preview card only mounts while a mark is hovered. A
      //     synthetic pointermove drives the same React handler a real pointer
      //     does, so its geometry can be measured without taking the pointer.
      timeouts.push(setTimeout(() => {
        const marks = [...document.querySelectorAll('button[data-index]')];
        const target = marks[Math.floor(marks.length / 2)];
        if (!target) return;
        target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
        timeouts.push(setTimeout(() => collect('rail-preview'), 300));
      }, 4000));

      // 3. The plan chip only renders while plan mode is on, so capture the
      //    composer the first time one appears.
      let planCaptured = false;
      const bodyObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
        if (planCaptured) return;
        const known = ((readState().selectors || {})['composer-plan-indicator'] || []).join(',');
        const chipEl = document.querySelector(known || '[class*="_chip"]');
        if (!chipEl) return;
        planCaptured = true;
        collect('static', chipEl);
      });
      if (bodyObserver) bodyObserver.observe(document.body, { childList: true, subtree: true });
      disposers.push(() => { if (bodyObserver) bodyObserver.disconnect(); });

      // 4. Popovers mount on demand inside a portal, so they never appear in the
      //    composer snapshot: capture each glass surface once, on first sight.
      const seenSurfaces = new WeakSet();
      let captured = 0;
      const sweepSurfaces = () => {
        if (captured >= 12) return;
        const nodes = document.querySelectorAll(
          '[data-menu-material], [class*="_material_"], [class*="_menu"], [class*="_panel"]',
        );
        for (const el of Array.from(nodes)) {
          if (captured >= 12) break;
          if (seenSurfaces.has(el)) continue;
          const cs = getComputedStyle(el);
          if (cs.backdropFilter === 'none' && cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
          seenSurfaces.add(el);
          captured += 1;
          collect('surface', el);
        }
      };
      const sweepTimer = setInterval(sweepSurfaces, 700);
      sweepSurfaces();
      disposers.push(() => clearInterval(sweepTimer));

      return {
        dump: () => collect('manual'),
        dispose() {
          timeouts.forEach((t) => clearTimeout(t));
          clearTimeout(hoverTimer);
          for (const fn of disposers) {
            try { fn(); } catch (err) { /* probe only */ }
          }
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENGINE — lifetimes, late stylesheets, diagnostics. Knows no DSH details.
    // ═══════════════════════════════════════════════════════════════════════

    function mount(ctx) {
      const patches = {
        tokens: PATCHES.filter((p) => p.kind === 'tokens'),
        variables: PATCHES.filter((p) => p.kind === 'variables'),
        components: PATCHES.filter((p) => p.kind === 'component'),
        behaviors: PATCHES.filter((p) => p.kind === 'behavior'),
      };

      const ui = createAdapters(ctx, patches);
      ui.applyTokenPatches();

      if (typeof document === 'undefined') {
        return { dispose: () => ui.dispose(), status: () => ({}) };
      }

      /** Patch id -> discovered | fallback, from the last resolution. */
      let resolution = {};
      /** Extra CSS from the live-tuning API; appended after the composed sheet. */
      let extra = '';
      /** Selectors of the last resolution, kept so the report can be re-measured. */
      let lastSelectors = {};

      const sync = () => {
        const state = ui.sync(extra);
        resolution = state.status;
        lastSelectors = state.selectors;
      };

      sync();
      const behaviors = ui.installBehaviors(() => lastSelectors);
      // The install count is recorded while behaviours install; one more publish
      // makes it visible without waiting for the next body mutation.
      sync();

      // Plugin stylesheets are injected asynchronously during boot, so the first
      // discovery pass may legitimately find nothing. Re-resolve when style
      // elements arrive, and once more on load.
      let timer;
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(sync, 200);
      };
      const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
      if (observer) observer.observe(document.head, { childList: true });
      window.addEventListener('load', schedule);

      // An adopted stylesheet can be installed without touching <head>, so the
      // observer above never fires for it. Retry resolution a couple of times
      // while any patch is still on its shipped constant, then stop.
      let retryTimer;
      const retryResolve = (attempt) => {
        if (attempt > 2) return;
        const stuck = Object.values(resolution).some((state) => state === 'fallback');
        if (!stuck) return;
        retryTimer = setTimeout(() => {
          sync();
          retryResolve(attempt + 1);
        }, attempt === 0 ? 1200 : 3000);
      };
      retryResolve(0);

      // The composer mounts after the plugin does and remounts per session, so a
      // measurement taken at mount time reports "none". Re-measure whenever the
      // body changes; this only republishes the report, it never re-renders CSS.
      let reportTimer;
      const bodyObserver = typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
          clearTimeout(reportTimer);
          reportTimer = setTimeout(() => publishReport(ctx, resolution, lastSelectors), 600);
        });
      if (bodyObserver) bodyObserver.observe(document.body, { childList: true, subtree: true });

      // Forensics are opt-in: off unless PROBE_ENABLED or a runtime call asks.
      let probe = null;
      const startProbe = () => {
        if (probe) return probe;
        probe = createProbe(() => ({ status: resolution, selectors: lastSelectors }));
        return probe;
      };
      if (PROBE_ENABLED) startProbe();

      // Verification hook: the user can type __vtInterface.status() in DevTools
      // to see which patches resolved, instead of judging by eye.
      const diagnostics = {
        version: VERSION,
        patches: PATCHES.map((p) => ({ id: p.id, kind: p.kind })),
        status: () => ({ ...resolution }),
        /**
         * Live tuning without restarting the app: replaces the extra block of the
         * injected sheet. Pass '' to clear. Use for value iteration only — the
         * next app start re-reads client.js and discards this.
         */
        css(text) {
          extra = typeof text === 'string' ? text : '';
          sync();
          return 'applied';
        },
        /** How many behaviours installed, and why the rest failed. */
        behaviors() {
          return { ...behaviors, errors: ui.behaviorErrors() };
        },
        /**
         * Live readings published by behaviours: how many user rows the clamp
         * found, how many are clamped or expanded, and the first clamped
         * bubble's measured geometry. Same values as its report tokens.
         */
        messages() {
          return ui.behaviorMetrics();
        },
        /**
         * Live state of the reading-position freeze (`scroll-pin`): which row this
         * turn pinned to, whether it engaged or was released, and the pin line it
         * acted on. Plain data, safe to read from a console.
         */
        scrollPin() {
          return ui.scrollPin();
        },
        /** Resolved selectors per patch, for auditing what each patch targets. */
        selectors() {
          return { ...lastSelectors };
        },
        /** Re-run target discovery (after the app injected more stylesheets). */
        resync() {
          sync();
          return { ...resolution };
        },
        /** Stack an extra theme-token layer, e.g. { '--dsw-alias-bg-base': { light, dark } }. */
        tokens(map) {
          ctx.theme.overrideTokens('vt-interface:tune', map);
          return 'applied';
        },
        /**
         * Start or stop the forensics probe. Off by default so a shipped patch
         * runs no timers it does not need; on, it posts measurements to the local
         * receiver in `tools/dump-receiver.mjs`.
         */
        probe(on) {
          if (on) startProbe();
          else if (probe) { probe.dispose(); probe = null; }
          return Boolean(probe);
        },
        /** Post one measurement immediately; requires the probe to be on. */
        dump() {
          return probe ? probe.dump() : 'probe off — call __vtInterface.probe(true) first';
        },
      };
      window.__vtInterface = diagnostics;

      return {
        dispose() {
          if (probe) probe.dispose();
          clearTimeout(timer);
          clearTimeout(retryTimer);
          clearTimeout(reportTimer);
          window.removeEventListener('load', schedule);
          if (observer) observer.disconnect();
          if (window.__vtInterface === diagnostics) delete window.__vtInterface;
          // The adapter face owns the stylesheet and every token layer it added.
          ui.dispose();
        },
        status: diagnostics.status,
      };
    }

    function safeCall(fn) {
      try { fn(); } catch (err) { /* a failed disposer must not block the rest */ }
    }

    return {
      inject: ['theme'],

      apply(ctx) {
        try {
          const mounted = mount(ctx);
          ctx.effect(() => () => mounted.dispose(), `${PLUGIN_ID}: ui patches`);
        } catch (err) {
          // A visual plugin must never take the app down; surface the reason in
          // DevTools instead of failing silently.
          if (typeof console !== 'undefined') console.error(`[${PLUGIN_ID}] apply failed`, err);
        }
      },
    };
  },
});
