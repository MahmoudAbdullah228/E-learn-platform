# Pathly — Design System (Reviewed & Approved)

> This is the single visual source of truth for the whole frontend build. Do not deviate from it —
> see `02-agent-rules.md §2`. It is `Project_Design.md` as supplied, reviewed against six Figma
> export screenshots, with the brand renamed from EduFlow to Pathly throughout.

## Review notes (what was checked, what changed)

**Reviewed against:** Navbar/Footer, "Landing Page & Global Components", "Course Components",
"Instructor Components", "Course Player Components", and "Student Components" — six Figma
component-sheet exports covering buttons, cards, inputs, the course catalog/detail pair, the
instructor profile, the video player, and the student dashboard/library/order-history.

**Result:** the written spec (colors, type scale, radii, spacing, shadows, and every named
component) matches what's actually drawn in those sheets. No corrections to tokens or component
descriptions were needed.

**One thing resolved:** the original document noted the Instructor page was "excluded because it
is still in progress." A dedicated "Instructor Components" sheet was supplied and reviewed — the
instructor profile card, quick-stats panel, and course-promo card in it match the system's existing
tokens exactly (same card chrome, same `heading-sm`/`stat` typography, same rounding scale). Treat
the Instructor Components sheet as finalized; build from it directly. If a later Figma update
changes it, re-run this review before changing any token here.

**Rename applied:** every instance of "EduFlow" below has been replaced with "Pathly". **The logo
icon/mark itself is unchanged** — only the wordmark text changed. Do not redesign the mark.

## Figma is frozen — what's drawn vs what you compose

**The Figma file itself will not be edited or extended.** Nobody is adding new frames to it. The
six sheets below are final and complete as reference material; they just don't cover every page
the app needs. Where a page isn't drawn, you build it yourself — strictly by **assembling the
tokens and components already defined in this document**, never by inventing a new color, radius,
type size, shadow, or a visually new component pattern. If two existing patterns could both work
for something undrawn, reuse the closer one rather than designing a third.

**Drawn and final — reproduce exactly:**
- Public nav bar and footer
- Landing page sections: hero, category tiles, course-card grid, instructor-invitation panel
- Course-catalog/detail component set: `search-field`, `course-card`, `curriculum-section` +
  lesson rows, `purchase-card`
- Instructor component set: `instructor-card`, the quick-stats panel, the course-promo card (these
  are the finalized building blocks for the instructor area — see below for what still needs
  composing with them)
- Course-player component set: video area, resource row, curriculum sidebar states, instructor
  mini-card
- Student component set: sidebar nav, `metric-card`, `learning-course-row`, `student-course-card`,
  the order-history `data-table`, the recommended-course card

**Not drawn — compose yourself from the components/tokens above, same system, no new design
language:**
- Full auth screens (login, register, forgot/reset password): assemble from the documented
  `auth-shell` spec (teal brand panel + white form panel) — only the component spec exists, no
  screenshot was supplied.
- The full `/courses` catalog **page layout** (left filter sidebar + results grid + active-filter
  chips + results count) — the pieces are drawn, the page assembly isn't.
- The full course-details **page layout** (how intro / outcomes / prerequisites / curriculum /
  instructor card / sticky purchase card sit together on one page).
- The full student dashboard, My Courses grid, Order History, and Profile **pages** — component
  pieces are drawn; the full page composition is yours.
- **The entire instructor area beyond the three finalized cards**: instructor dashboard page,
  course editor, curriculum editor, application screens. Build these using the same
  cards/forms/typography/spacing rules as everywhere else — same input styles, same button
  styles, same `curriculum-section` component reused from the player, same card radii/shadows. Do
  not design a visually distinct "instructor style."
- **The entire admin area**: dashboard, instructor-applications review, course review, course
  **revision** review, course administration (archive/block), categories management, orders,
  user management (search/suspend/reactivate/revoke sessions), and the admin finance dashboard —
  nothing was drawn for admin. Compose from `metric-card`, `data-table`, `segmented-filter`,
  forms, and the status/badge components already defined.
- **Earnings, payouts and refunds**: the student refund-request action, the instructor finance
  dashboard (summary/sales/earnings ledger/settlement history), and the admin payout lifecycle
  (preview/draft/confirm/cancel/reconciliation) screens. None were drawn. Compose from
  `metric-card` for summaries, `data-table` for ledgers/history, `status-badge-paid`'s pattern for
  any new status pill (same pill shape/typography, just a different label and status color from
  the existing palette — never a new color), and standard forms for the refund-decision and
  payout-confirmation actions.
- Checkout success/cancel pages, the order-detail page layout.
- Empty states, loading states, error states, and the 404 page (use the documented
  `ex-empty-state-card`/`ex-toast` patterns).
- Mobile/tablet responsive versions of every page — the original document already flags the whole
  responsive strategy as "recommended, not taken from Figma."

---

---
version: alpha
name: Pathly
description: The design language of Pathly, an Egyptian e-learning marketplace for students and instructors. A calm, trustworthy teal-and-navy system on a pale blue-grey canvas, with white rounded cards, Inter type and soft teal-tinted shadows. The mood is friendly, focused and academic, never loud.

colors:
  primary: "#088395"
  primary-light: "#37b7c3"
  primary-soft: "#9dd6dc"
  primary-tint: "#e5f3f5"
  primary-wash: "#f3f9fa"
  on-primary: "#ffffff"
  navy: "#071952"
  canvas: "#ebf4f6"
  surface: "#ffffff"
  surface-muted: "#f7f8fa"
  surface-subtle: "#f8f9fa"
  ink: "#071952"
  ink-secondary: "#708294"
  ink-muted: "#7d8794"
  ink-placeholder: "#929cad"
  ink-nav: "#4b5563"
  border: "#e5e7eb"
  hairline: "#f1f3f5"
  track: "#f3f4f6"
  success: "#22c55e"
  success-strong: "#16a34a"
  success-ink: "#166534"
  success-bg: "#dcfce7"
  success-border: "#bbf7d0"
  error: "#ef4444"
  error-bg: "#fef2f2"
  tint-green: "#f0fdf4"
  tint-blue: "#eff6ff"
  tint-rose: "#fff2f3"
  video-black: "#000000"

typography:
  display:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0
  heading-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
  heading-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  heading-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: 0
  heading-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  overline:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.06em
    textTransform: uppercase
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  button-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  price:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  stat:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  tag:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 48px
  section: 64px

shadows:
  card: "0 2px 4px rgba(7, 25, 82, 0.03)"
  raised: "0 12px 32px rgba(7, 25, 82, 0.04)"
  button: "0 4px 8px rgba(8, 131, 149, 0.15)"
  hover: "0 4px 8px rgba(8, 131, 149, 0.25)"
  tile-hover: "0 4px 10px rgba(0, 0, 0, 0.09)"

components:
  nav-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderBottom: "{colors.hairline}"
    padding: "{spacing.md} {spacing.xxl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.xl}"
    shadow: "{shadows.button}"
  button-primary-hover:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.xl}"
    shadow: "{shadows.button}"
  button-primary-lg:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.md}"
    padding: "{spacing.md} {spacing.xl}"
    shadow: "{shadows.button}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.canvas}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.xl}"
  button-secondary-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    borderColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.xl}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    borderColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.md}"
  link-action:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    placeholderColor: "{colors.ink-placeholder}"
    borderColor: "{colors.border}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  input-focused:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  input-invalid:
    backgroundColor: "{colors.error-bg}"
    borderColor: "{colors.error}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  search-field:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    placeholderColor: "{colors.ink-placeholder}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs} {spacing.sm}"
  search-field-hover:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs} {spacing.sm}"
  category-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    iconBackground: "{colors.primary-tint}"
    iconColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  category-tile-hover:
    backgroundColor: "{colors.surface}"
    iconBackground: "{colors.primary}"
    iconColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    shadow: "{shadows.tile-hover}"
  course-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  course-card-hover:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.hover}"
  category-tag:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xxs} {spacing.xs}"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs} {spacing.sm}"
  segmented-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    activeBackground: "{colors.primary}"
    activeTextColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.xxs}"
  progress-bar:
    trackColor: "{colors.track}"
    fillColor: "{colors.primary}"
    completeFillColor: "{colors.success}"
    rounded: "{rounded.full}"
    height: 6px
  metric-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    labelColor: "{colors.ink-muted}"
    iconBackground: "{colors.primary-tint}"
    typography: "{typography.stat}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
    shadow: "{shadows.card}"
  sidebar-nav-item:
    backgroundColor: transparent
    textColor: "{colors.ink-nav}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  sidebar-nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  learning-course-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
    shadow: "{shadows.card}"
  student-course-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
    shadow: "{shadows.card}"
  purchase-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.price}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
    shadow: "{shadows.raised}"
  curriculum-section:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.lg}"
  curriculum-lesson-completed:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    statusColor: "{colors.success}"
    typography: "{typography.body}"
    padding: "{spacing.sm} {spacing.md}"
  curriculum-lesson-current:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.primary}"
    borderLeft: "{colors.primary}"
    typography: "{typography.body}"
    padding: "{spacing.sm} {spacing.md}"
  curriculum-lesson-future:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    padding: "{spacing.sm} {spacing.md}"
  data-table:
    backgroundColor: "{colors.surface}"
    headerBackground: "{colors.surface-subtle}"
    headerTypography: "{typography.overline}"
    headerTextColor: "{colors.ink-muted}"
    bodyTypography: "{typography.body}"
    rowBorder: "{colors.border}"
    rounded: "{rounded.lg}"
    cellPadding: "{spacing.sm} {spacing.md}"
  status-badge-paid:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-ink}"
    borderColor: "{colors.success-border}"
    typography: "{typography.tag}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs} {spacing.xs}"
  learning-resource:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.md}"
  video-player:
    backgroundColor: "{colors.video-black}"
    textColor: "{colors.on-primary}"
    seekTrack: "rgba(255, 255, 255, 0.15)"
    seekFill: "{colors.primary}"
    rounded: "{rounded.lg}"
  instructor-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-sm}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  instructor-invitation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-lg}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxxl}"
  auth-shell:
    backgroundColor: "{colors.surface}"
    brandPanelBackground: "{colors.primary}"
    brandPanelText: "{colors.on-primary}"
    typography: "{typography.heading-xl}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.section}"
    shadow: "{shadows.raised}"
  footer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    headingColor: "{colors.ink}"
    typography: "{typography.body}"
    borderTop: "{colors.hairline}"
    padding: "{spacing.section} {spacing.xxl}"

  # ─── Examples (illustrative) — derived from Pathly primitives ───
  ex-pricing-tier:
    description: "Default pricing tier card. Re-uses the purchase-card chrome on a white surface."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  ex-pricing-tier-featured:
    description: "Featured tier, polarity-flipped: teal fill with white text."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  ex-product-selector:
    description: "What's Included summary card, built like the Learning Outcomes panel."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
  ex-cart-drawer:
    description: "Order summary, with line items per course."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xl}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row. The active state uses a white pill with teal text."
    backgroundColor: transparent
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  ex-data-table-cell:
    description: "Data-table th and td chrome, matching the Order History table."
    headerBackground: "{colors.surface-subtle}"
    headerTypography: "{typography.overline}"
    bodyTypography: "{typography.body}"
    cellPadding: "{spacing.sm} {spacing.md}"
    rowBorder: "{colors.border}"
  ex-auth-form-card:
    description: "Sign-in or sign-up card. The form half of the auth-shell."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.section}"
  ex-modal-card:
    description: "Modal dialog surface with raised shadow."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: "{spacing.xxl}"
    shadow: "{shadows.raised}"
  ex-empty-state-card:
    description: "Empty-state frame, for example 'No courses yet'."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.section}"
    captionTypography: "{typography.body}"
  ex-toast:
    description: "Toast notification on a white card shape with raised shadow."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body}"

---


## Overview

Pathly is an e-learning marketplace. Students browse and buy courses, learners track their progress, and instructors publish their teaching. Its design is deliberately calm. Pages sit on a pale blue-grey canvas (`{colors.canvas}`, #ebf4f6) and are built from white, softly rounded cards. Colour is used sparingly and always with a purpose: deep **teal** (`{colors.primary}`, #088395) marks every action, and **navy** (`{colors.navy}`, #071952) carries every heading. The overall effect is a quiet, focused study space rather than a busy storefront.

There are only two brand hues and they split the work cleanly. Teal is the voice of action: buttons, links, active navigation, progress, prices and category tags. Navy is the voice of content: headings, course titles and the brand wordmark. Its lighter partner, **Light Teal** (`{colors.primary-light}`, #37b7c3), appears only as a hover state and a decorative accent. A family of cool greys (`{colors.ink-secondary}` through `{colors.ink-placeholder}`) handles everything secondary. Green status colours are reserved for completion and payment.

Geometry is friendly but disciplined. Buttons round at `{rounded.sm}` (6px), inputs and tiles at `{rounded.md}` (8px), dashboard cards at `{rounded.lg}` (12px), course cards at `{rounded.xl}` (16px), and large panels at `{rounded.xxl}` (24px). Shadows are barely there. Cards separate from the canvas by contrast, and only interactive elements get a teal-tinted glow.

**Key Characteristics:**
- A pale blue-grey canvas (`{colors.canvas}`) with white cards. Sections alternate between white and canvas bands on public pages.
- Teal (`{colors.primary}`) owns every action. Navy (`{colors.ink}`) owns every heading. Nothing else competes.
- Hover states lighten teal to `{colors.primary-light}` or add a teal border or glow. The system never darkens on hover.
- Inter throughout, with bold navy headings over regular grey supporting text.
- Soft geometry from 6px to 24px, with fully rounded avatars, icon circles, progress bars and badges.
- Hero headlines split into two lines: a navy statement, then a teal payoff ("Learn New Skills. / **Build Your Future.**").
- Flat, friendly illustrations on public and auth pages, and real course thumbnails (laptops, code, dashboards) everywhere else.

## Colors

> Source pages analyzed: Design System (component sheets), Public (Landing, Course Catalog, Course Details, Instructor Profile), Authentication (Login, Registration) and Student (Dashboard, My Courses, Course Overview, Video Player, Order History, My Profile). The Instructor page is excluded because it is still in progress.

### Figma Variables
The file defines four colour variables. Everything else below was found in use without a variable and is proposed as a new token.

| Figma variable | Token | Hex |
|---|---|---|
| Dark Teal | `{colors.primary}` | #088395 |
| Light Teal | `{colors.primary-light}` | #37b7c3 |
| Dark Navy | `{colors.navy}` / `{colors.ink}` | #071952 |
| Main Background | `{colors.canvas}` | #ebf4f6 |

### Brand & Accent
- **Dark Teal** (`{colors.primary}`, #088395): The action colour. Used for primary buttons, links, active nav text, progress fills, prices, category-tag text, and the brand mark icon.
- **Light Teal** (`{colors.primary-light}`, #37b7c3): The hover state for primary buttons and a decorative accent, such as the auth illustration panel and avatar rings.
- **Teal Soft** (`{colors.primary-soft}`, #9dd6dc): List bullets in "What You'll Learn".
- **Teal Tint** (`{colors.primary-tint}`, #e5f3f5): Icon circles on category tiles and metric cards, and the play-button backing.
- **Teal Wash** (`{colors.primary-wash}`, #f3f9fa): The current-lesson row background in the curriculum.

### Surface
- **Canvas** (`{colors.canvas}`, #ebf4f6): The page base on dashboards and alternate section bands on public pages. Also the category-tag fill.
- **Surface** (`{colors.surface}`, #ffffff): Cards, nav bar, footer, form panels and white section bands.
- **Surface Muted** (`{colors.surface-muted}`, #f7f8fa): Search fields and social-link buttons.
- **Surface Subtle** (`{colors.surface-subtle}`, #f8f9fa): Table header rows and curriculum section headers.

### Text
- **Ink / Navy** (`{colors.ink}`, #071952): Headings, titles, wordmark, form labels and primary body copy.
- **Ink Secondary** (`{colors.ink-secondary}`, #708294): Supporting paragraphs, summaries, bios and footer links.
- **Ink Muted** (`{colors.ink-muted}`, #7d8794): Metadata such as instructor names, lesson counts and metric labels. This absorbs the near-duplicate #7c8495.
- **Ink Placeholder** (`{colors.ink-placeholder}`, #929cad): Placeholders, search icons and fine print. This absorbs the near-duplicates #98a2b3 and #9ca3af.
- **Ink Nav** (`{colors.ink-nav}`, #4b5563): Inactive sidebar navigation labels and icons.

### Lines & Tracks
- **Border** (`{colors.border}`, #e5e7eb): Input borders, table row lines, and outlines on resource and curriculum cards. This absorbs #e5e9ec.
- **Hairline** (`{colors.hairline}`, #f1f3f5): Dividers inside cards, and the nav and footer separators.
- **Track** (`{colors.track}`, #f3f4f6): The empty part of every progress bar.

### Status
- **Success** (`{colors.success}`, #22c55e): Completed-lesson icons and the fill of a 100% progress bar.
- **Success Strong** (`{colors.success-strong}`, #16a34a): The "Completed" check badge.
- **Success Ink / BG / Border** (#166534 / #dcfce7 / #bbf7d0): The "Paid" status badge.
- **Error** (`{colors.error}`, #ef4444) and **Error BG** (`{colors.error-bg}`, #fef2f2): The invalid input state.
- **Tints** (`{colors.tint-green}` #f0fdf4, `{colors.tint-blue}` #eff6ff, `{colors.tint-rose}` #fff2f3): Icon backings for metric cards and file-type icons.

## Typography

### Font Family
- **Inter** is the only family. It is used at 400 for body copy, 600 for titles and buttons, and 700 for headings, prices and stats.

**Note on scale:** The Figma frames were drawn at mixed zoom levels. Public pages range from 1031 to 1375px wide, and Student pages from 2117 to 2857px. Raw font sizes therefore vary from frame to frame. The ramp below is normalized to a 1440px desktop viewport and snapped to whole pixels, keeping the relative hierarchy seen in the designs.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display}` | 44px | 700 | 1.15 | Landing hero headline (navy line plus teal line) |
| `{typography.heading-xl}` | 32px | 700 | 1.25 | Page titles ("Explore Courses"), course title, instructor name, auth headings |
| `{typography.heading-lg}` | 24px | 700 | 1.3 | Section headings ("Popular Courses", "Welcome back, Mohammed!", "Course Curriculum") |
| `{typography.heading-md}` | 20px | 700 | 1.35 | Sub-section and card-group headings |
| `{typography.heading-sm}` | 18px | 600 | 1.4 | Panel headings ("Quick Stats"), instructor-card name |
| `{typography.title}` | 16px | 600 | 1.4 | Course-card titles, lesson-row titles, curriculum section titles |
| `{typography.body-lg}` | 16px | 400 | 1.6 | Lead paragraphs, course descriptions, instructor bio |
| `{typography.body}` | 14px | 400 | 1.5 | Default body copy, nav links, inputs |
| `{typography.body-sm}` | 13px | 400 | 1.5 | Filter chips, secondary metadata |
| `{typography.caption}` | 12px | 400 | 1.4 | Lesson counts, "65% complete", dates, file sizes |
| `{typography.label}` | 14px | 600 | 1.4 | Form labels, link actions ("View Details") |
| `{typography.overline}` | 12px | 700 | 1.4 | All-caps eyebrows and table headers ("STUDENT ACCOUNT", "ORDER ID") |
| `{typography.button}` | 14px | 600 | 1 | Default button label |
| `{typography.button-lg}` | 16px | 600 | 1 | Full-width and purchase buttons |
| `{typography.price}` | 18px | 700 | 1.3 | Prices ("EGP 1,299") |
| `{typography.stat}` | 24px | 700 | 1.2 | Metric values on dashboard cards |
| `{typography.tag}` | 11px | 500 | 1.2 | Category tags, status badges |

### Principles
- Headings are navy and bold. Supporting text drops to grey and regular weight. Hierarchy comes from colour as much as size.
- Hero headlines may split their last phrase into teal for emphasis. Teal is not used in body copy except for links.
- Prices are always bold and always prefixed "EGP". On cards they are teal; in purchase and dashboard contexts they are navy.
- Uppercase is reserved for `{typography.overline}` eyebrows and table headers.

## Layout

### Spacing System
- **Base unit**: 4px.
- **Tokens**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 20px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.xxxl}` 48px · `{spacing.section}` 64px.
- Card interiors use `{spacing.md}` on dashboards and `{spacing.xxl}` on large public panels. Buttons pad `{spacing.sm}` vertically by `{spacing.xl}` horizontally. Gaps between cards are `{spacing.md}` to `{spacing.xl}`.

### Grid & Container
- Content sits in a centered column of about 1200px max width with `{spacing.xl}` gutters, on full-bleed white or canvas bands.
- **Public pages:** two-column hero (copy left, illustration right). Then a 6-up category tile row and a 4-up course card grid, a two-column instructor-invitation panel, and a 4-column footer.
- **Course Catalog:** left filter sidebar (categories, price, checkboxes) with a course grid on the right, plus active-filter chips and a results count.
- **Course Details:** main column (intro, learning outcomes, prerequisites, curriculum, instructor card) with a sticky purchase card on the right.
- **Student area:** a white top bar (logo, notifications, avatar), then a left sidebar nav (about 240px) beside the content workspace. Dashboard order: welcome heading, 4 metric cards, "Continue Learning" rows, then a 3-up "Recommended for You" grid.
- **Video Player:** a dark video area with the lesson workspace (overview and resources tabs) on the left and the curriculum list on the right.
- **Auth pages:** one centered card split into a teal brand panel (logo, headline, quote or benefits, illustration) and a white form panel.

### Whitespace Philosophy
Generous and even. Public sections breathe with `{spacing.section}` vertical padding and alternate white and canvas bands for rhythm. Dashboard cards sit close together (`{spacing.md}` gaps), with breathing room coming from the canvas around them rather than from heavy padding inside.

### Responsive Strategy

> The designs are desktop-only. The breakpoints below are a recommended strategy, not taken from Figma.

#### Breakpoints
| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Single column. Nav collapses to logo plus hamburger. Hero illustration moves below the copy. Course grid becomes 1-up. The student sidebar becomes a bottom sheet or drawer. |
| Tablet | 768–1023px | Course grid 2-up, category tiles 3-up. The catalog filter sidebar becomes a filter drawer. The purchase card un-sticks and sits below the course intro. |
| Laptop | 1024–1279px | Course grid 3-up. Sidebar layouts retained. |
| Desktop | ≥ 1280px | Full layouts as designed, in a centered ~1200px column. |

#### Touch Targets
`button-primary` and `button-primary-lg` clear 44px tap height on mobile through extra vertical padding. Sidebar nav items, curriculum rows and filter options meet the same minimum.

#### Collapsing Strategy
The auth shell drops its teal brand panel below 768px and keeps only the form, with the logo on top. The order history table scrolls horizontally inside its card. Dashboard metric cards go from 4-up to 2-up to 1-up.

#### Image Behavior
Course thumbnails keep a 16:9 crop and their card's top corner radius. Illustrations scale fluidly within their column.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0, Flat | No shadow. White against `{colors.canvas}` | Most public cards, category tiles, sections |
| 1, Card | `{shadows.card}`: `0 2px 4px rgba(7,25,82,0.03)` | Dashboard metric cards, course rows, profile panels |
| 2, Raised | `{shadows.raised}`: `0 12px 32px rgba(7,25,82,0.04)` | Purchase card, auth shell, modals |
| Action glow | `{shadows.button}`: `0 4px 8px rgba(8,131,149,0.15)` | Primary buttons (default and hover) |
| Hover lift | `{shadows.hover}`: `0 4px 8px rgba(8,131,149,0.25)` | Course card hover |

Depth comes mainly from **contrast**: white cards on the blue-grey canvas. Shadows are navy-tinted and extremely soft. The one recognisable shadow is the **teal glow** under primary buttons, which ties elevation to action.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Category tags, small chips, checkboxes |
| `{rounded.sm}` | 6px | Buttons |
| `{rounded.md}` | 8px | Inputs, search fields, category tiles, sidebar nav items, segmented filter |
| `{rounded.lg}` | 12px | Dashboard cards, course rows, tables, curriculum sections, video player |
| `{rounded.xl}` | 16px | Public course cards |
| `{rounded.xxl}` | 24px | Purchase card, instructor card, instructor invitation panel, auth shell |
| `{rounded.full}` | 9999px | Avatars, icon circles, progress bars, status badges, filter chips, play buttons |

### Photography Geometry
Course thumbnails are 16:9 and inherit the top corners of their card, with square bottom corners where they meet the card body. Illustrations sit inside `{rounded.lg}` to `{rounded.xxl}` frames. Portraits and avatars are always circular, sometimes with a `{colors.primary-light}` ring.

## Components

> Hover, focus, active and validation states are documented in Figma for the components below. Each state is a separate `components:` entry.

### Buttons

**`button-primary`**: the teal action button
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, rounded `{rounded.sm}`, padding `{spacing.sm} {spacing.xl}`, teal glow `{shadows.button}`. Used for "Explore Courses", "Sign Up", "Continue Learning" and "Become an Instructor". May carry a trailing arrow icon.
- **Hover** (`button-primary-hover`): background lightens to `{colors.primary-light}`.

**`button-primary-lg`**: full-width or high-intent action
- Same as primary at `{typography.button-lg}`, rounded `{rounded.md}`, padding `{spacing.md} {spacing.xl}`. Used for "Purchase Course", "Log In" and "Create Account".

**`button-secondary`**: quiet white button
- Background `{colors.surface}`, text `{colors.ink}`, 1px `{colors.canvas}` border, rounded `{rounded.sm}`. Used for "Start Learning" beside a primary CTA.
- **Hover** (`button-secondary-hover`): border and text turn `{colors.primary}`.

**`button-outline`**: teal outline button
- White background, `{colors.primary}` text and border. Used for "Review Course" on completed course cards.

**`link-action`**: inline text action
- `{colors.primary}` text at `{typography.label}`. Used for "View Details", "View All", "Forgot password?" and "View Order".

### Cards & Containers

**`course-card`**: public course card
- White, `{rounded.xl}`, 16:9 thumbnail on top. Title at `{typography.title}` in navy, "By {instructor}" in `{colors.ink-muted}`, and a footer row with `category-tag` on the left and a teal price on the right.
- **Hover** (`course-card-hover`): teal shadow `{shadows.hover}`.

**`category-tile`**: popular category tile
- White, `{rounded.md}`, centered `{colors.primary-tint}` icon circle with a `{colors.primary}` icon, label below in navy.
- **Hover** (`category-tile-hover`): the icon circle fills `{colors.primary}` with a white icon, and the tile gains `{shadows.tile-hover}`.

**`metric-card`**: dashboard stat
- White, `{rounded.lg}`, `{shadows.card}`. A tinted icon circle on the left, then a label in `{colors.ink-muted}` and a value at `{typography.stat}`. A progress variant replaces the icon with a label, a percentage and a `progress-bar`.

**`learning-course-row`**: continue-learning row
- White, `{rounded.lg}`. Thumbnail, then title and instructor, then "% complete / x of y lessons" above a `progress-bar`, with a `button-primary` "Continue Learning" on the right.

**`student-course-card`**: My Courses grid card
- Vertical card with thumbnail, title, instructor, progress and a full-width action. In progress it shows `button-primary` "Continue Learning". When complete it shows a green "✓ Completed" status, a full green bar, and `button-outline` "Review Course".

**`purchase-card`**: course details sidebar
- White, `{rounded.xxl}`, `{shadows.raised}`. A video preview with a circular play button, the price at `{typography.price}` (EGP), `button-primary-lg` "Purchase Course", and purchase terms in `{typography.caption}`.

**`instructor-card`** and **`instructor-invitation`**
- Large white panels at `{rounded.xxl}`. The instructor card holds a circular portrait, name, teal professional title, bio and a "View Instructor Profile →" link. The invitation pairs a headline, copy and CTA with an illustration on a canvas band.

**`auth-shell`**: login and registration card
- A centered white card at `{rounded.xxl}` with `{shadows.raised}`. The left half is a `{colors.primary}` brand panel with decorative translucent circles, white logo, white headline at `{typography.heading-xl}`, a quote or a checklist of benefits, and an illustration. The right half is the form.

### Inputs & Forms

**`input`**: text field
- White, 1px `{colors.border}`, `{rounded.md}`, padding `{spacing.sm} {spacing.md}`, placeholder `{colors.ink-placeholder}`. The label sits above at `{typography.label}` in navy. Password fields have a trailing eye icon.
- **Focused** (`input-focused`): border `{colors.primary}`.
- **Invalid** (`input-invalid`): background `{colors.error-bg}`, border `{colors.error}`.

**`search-field`**: course search
- `{colors.surface-muted}` fill, leading magnifier icon in `{colors.ink-placeholder}`, `{rounded.md}`. Placeholder text is "What do you want to learn?" or "Search courses...".
- **Hover** (`search-field-hover`): white background with a `{colors.primary}` border.

**Checkboxes**: square at `{rounded.xs}` with a grey border, filled `{colors.primary}` when checked. Used for "Remember me", terms agreement and catalog filters.

### Navigation

**`nav-bar`**: public top navigation
- White bar with a `{colors.hairline}` bottom border. Logo (teal graduation cap plus navy "Pathly" wordmark), then centered links (Home, Explore Courses, search icon), then "Become an Instructor", "Log In" and `button-primary` "Sign Up" on the right. The active link is teal.

**Student top bar**: logo on the left, notification bell and circular avatar on the right.

**`sidebar-nav-item`**: student sidebar
- Icon plus label in `{colors.ink-nav}`, `{rounded.md}`. Items: Dashboard, My Courses, Order History, Profile.
- **Active** (`sidebar-nav-item-active`): white background, `{colors.primary}` icon and label.

**`segmented-filter`**: All Courses / In Progress / Completed
- White container. The active segment is filled `{colors.primary}` with white text at `{rounded.sm}`.

**`filter-chip`**: removable active filter in the catalog, with pill shape, border and a × icon.

**Breadcrumb**: Home › Courses › Category in `{colors.ink-muted}`, current page in navy.

**`footer`**
- White with a `{colors.hairline}` top border. A brand column (logo plus tagline), then link groups "Discovery", "Instructor" and "Account" with navy headings and `{colors.ink-secondary}` links, then a centered copyright line.

### Signature Components

**`progress-bar`**: thin, fully rounded track (`{colors.track}`) with a `{colors.primary}` fill. It turns `{colors.success}` at 100%. It usually appears with a "% complete" label on the left and "x of y lessons" on the right in `{typography.caption}`.

**`curriculum-section`** and **curriculum lessons**
- An expandable section header (chevron, title, "n Lessons • duration"). Lesson rows show a play or file icon, a title, a duration, and an optional teal "Preview" label.
- In the player: **completed** rows show a green check, the **current** row gets a `{colors.primary-wash}` background with a teal left border and teal title, and **future** rows are muted.

**`video-player`**: black video area with a play button, a thin white-on-15% seek track filled teal, and white controls (play, skip, volume, time, speed, captions, settings, fullscreen).

**`learning-resource`**: downloadable file row, with a tinted file-type icon, filename and size, and a download icon on the right.

**`data-table`**: Order History
- Toolbar with search on the left and dropdown filters on the right. Uppercase `{typography.overline}` headers on `{colors.surface-subtle}`, rows separated by `{colors.border}`, a course thumbnail beside its title, an amount in bold, a `status-badge-paid`, and a "View Order" link.

**`status-badge-paid`**: green pill with a dot and "Paid" (`{colors.success-bg}` fill, `{colors.success-border}` border, `{colors.success-ink}` text).

**`category-tag`**: small `{colors.canvas}` chip with teal text at `{typography.tag}` and `{rounded.xs}`.

### Examples (illustrative)

> Demonstration surfaces derived from Pathly primitives, so downstream tools can re-skin common patterns consistently.

**`ex-pricing-tier`**: default pricing tier, using the purchase-card chrome.
- Properties: `backgroundColor`, `textColor`, `borderColor`, `rounded`, `padding`

**`ex-pricing-tier-featured`**: featured tier, teal fill with white text.
- Properties: `backgroundColor`, `textColor`, `rounded`, `padding`

**`ex-product-selector`**: What's Included summary, built like Learning Outcomes.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-cart-drawer`**: order summary with line items per course.
- Properties: `backgroundColor`, `rounded`, `padding`, `item-divider`

**`ex-app-shell-row`**: sidebar nav row with a teal active state.
- Properties: `backgroundColor`, `activeIndicator`, `rounded`, `padding`

**`ex-data-table-cell`**: table th and td chrome matching Order History.
- Properties: `headerBackground`, `headerTypography`, `bodyTypography`, `cellPadding`, `rowBorder`

**`ex-auth-form-card`**: the form half of the auth shell.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-modal-card`**: modal with raised shadow.
- Properties: `backgroundColor`, `rounded`, `padding`, `shadow`

**`ex-empty-state-card`**: empty-state frame.
- Properties: `backgroundColor`, `rounded`, `padding`, `captionTypography`

**`ex-toast`**: toast notification.
- Properties: `backgroundColor`, `rounded`, `padding`, `typography`


## Do's and Don'ts

### Do
- Put content on white cards over the `{colors.canvas}` background, and alternate white and canvas bands between public page sections.
- Use `{colors.primary}` for every interactive element: buttons, links, active nav, progress and prices on cards.
- Set headings in bold Inter navy (`{colors.ink}`) and supporting text in `{colors.ink-secondary}` or `{colors.ink-muted}`.
- Show hover by lightening to `{colors.primary-light}`, adding a teal border, or adding the teal glow.
- Show progress everywhere a student is mid-course: a thin rounded bar plus "% complete" and "x of y lessons".
- Keep prices in EGP, bold, with the "EGP" prefix ("EGP 1,299").
- Use green only for completion and payment status.

### Don't
- Don't introduce a new accent hue. Teal, navy and the status greens are the whole palette.
- Don't use navy for buttons or teal for headings (the hero's teal payoff line is the only exception).
- Don't darken on hover. Pathly lightens.
- Don't use heavy or grey drop shadows. Depth comes from white-on-canvas contrast, with a teal glow only on actions.
- Don't square off cards or inputs. Every surface is rounded on the `{rounded.*}` scale.
- Don't mix in other typefaces. Inter is the only family, so any Arimo text layers left in Figma should be switched to Inter.
- Don't use uppercase outside eyebrows and table headers.
