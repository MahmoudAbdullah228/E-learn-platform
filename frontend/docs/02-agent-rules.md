# Pathly — Agent Rules

> These rules override your own defaults whenever they conflict. If a request from the user
> contradicts a rule here, point out the conflict before acting instead of silently picking one
> side. If you are unsure whether something is allowed, treat it as not allowed and flag it in
> `03-progress-tracker.md` instead of guessing.

## 1. Role and boundaries

- You are building the **frontend only** for Pathly, an existing, already-built backend.
- **Never** modify, generate, or suggest changes to backend code, database schema, or
  infrastructure. If a frontend need seems to require a backend change (a missing endpoint, a
  missing field), do not invent a workaround that fakes it client-side. Stop, log it as a
  blocked item, and move to the next task.
- **Running the backend locally is allowed and expected — editing it is not.** Per
  `backend-setup-guide.html`, you may `cd backend && npm install`, copy `.env.example` to a local
  `.env` and fill in its values, run `npm run mongo:local`, `npm run seed:*`, and `npm run dev` to
  stand up a real local API to test the frontend against. None of that is "editing the backend" —
  `.env` is local, untracked configuration, not source. What's off-limits is touching any tracked
  file under `backend/` (anything in `backend/src`, its config, tests, etc.).
- The only backend contract you may rely on is `frontend-handoff.md` and the live Swagger
  document at `https://app.swaggerhub.com/apis-docs/depi-979/e-learning-marketplace-api/2.0.0`.
  Anything not written there does not exist yet, no matter how reasonable it seems.
- Treat `flowchart.pdf` as the source of truth for *business flow and sequencing* (what leads to
  what, what states exist), not as an API spec — where it implies a call that the handoff doc
  doesn't document, the handoff doc wins and the gap gets logged, not guessed.

### 1.1 Contract depth — what's fully documented vs what you must look up yourself
`frontend-handoff.md` documents Sprint 1 and Sprint 2 in full detail (through story S2-11). The
backend itself is further along than that: `backend-src-guide.html` (provided for reference, not
as a build target) confirms these additional modules exist and are implemented —
`adminUsers` (search/view users, suspend/reactivate, revoke sessions, last-admin protection),
`courseRevisions` (editing an already-published course creates an isolated revision that is
reviewed and published atomically — this is the "major edit → back to pending review" rule
already in `01-project-steps.md`/Project_Plan.md, now confirmed backend-side),
`courseAdministration` (archive, an independent legal/security block, admin text correction),
`refunds`, `earnings`, `payouts`, `instructorFinance`, `adminFinance`, and `audit`.
**None of these have a documented request/response contract in `frontend-handoff.md`.** Before
building any screen for them, read the actual contract from the live Swagger document — do not
guess field names, and do not skip the feature just because the handoff doc is silent on it.
The `operations` module (financial preflight, sale migration, restore reconciliation) is
backend-internal tooling for the project owner, not a frontend feature — do not build any UI for
it.

## 2. Design system compliance

- `04-design-system.md` is the only visual source of truth. Every color, font size, spacing value,
  radius, and shadow you use must be one of its named tokens. Never introduce a new hex value, a
  new font, or an ad-hoc spacing number "because it looked closer."
- Brand name is **Pathly**. Keep the exact logo icon/mark from the Figma file; only the wordmark
  text changes from "EduFlow" to "Pathly". Do not leave "EduFlow" anywhere in UI copy, titles,
  meta tags, or placeholder content.
- The Figma file is frozen — nobody is adding or editing frames in it. `04-design-system.md §Figma
  is frozen` lists exactly what's drawn versus what you must compose yourself. For anything not
  drawn (all of the admin area, most of the instructor area beyond the three finalized cards, full
  page layouts for catalog/dashboard/auth, empty/error/loading states, responsive variants): build
  it by assembling the existing tokens and components only. Never invent a new color, radius, type
  size, shadow, or a visually distinct pattern "for this section" — including for the instructor
  pages, which must look and behave like the rest of the system, not like a separate product area.
- Don't darken on hover (the system only lightens to `primary-light` or adds a teal glow/border).
  Don't square off cards or inputs. Don't use uppercase outside `overline`/table headers. Don't mix
  in another typeface — Inter only.

### UI library split (owner decision — binding, not an assumption)
**Public + auth surfaces** — landing, `/courses` catalog, `/courses/:slug` details,
`/instructors/:instructorId`, `/login`, `/register`, `/verify-email`, `/forgot-password`,
`/reset-password` — are built with **Tailwind + shadcn/ui only**. No Ant Design here at all; these
are the consumer-facing, first-load-matters pages.

**Dashboard surfaces** — everything behind the authenticated guards: the whole `/app/*` area
(student dashboard, my-courses/library, player workspace, orders, profile), the whole
`/instructor/*` area (dashboard, course editor, curriculum editor, applications, profile), and the
whole `/admin/*` area — are built with **Ant Design** as the primary component library (`Layout`,
`Table`, `Form`, `Statistic`, `Upload`, `Steps`, `Tabs`, `Menu`, `Drawer`, `Modal`,
`message`/`notification`), because it genuinely fits data-dense, form-heavy internal screens
better than composing them from shadcn primitives.

**Either way, the rendered result must be visually indistinguishable from
`04-design-system.md`.** AntD is an implementation engine here, not a different look: re-theme it
with `ConfigProvider`'s `theme.token` (and per-component `theme.components` overrides) to the exact
tokens — `colorPrimary` → `{colors.primary}`, `borderRadius` → the relevant `{rounded.*}` value per
component type (not one global radius), `fontFamily` → Inter, success/error colors →
`{colors.success}`/`{colors.error}`, card/table surfaces → `{colors.surface}` /
`{colors.surface-subtle}`. A default-blue AntD button, AntD's default card shadow, or AntD's
default table header must never ship. Within the dashboard surfaces, don't mix in shadcn versions
of the same element (e.g. a shadcn `Button` next to an AntD `Button`) — pick AntD there and stay
consistent.

Tailwind utility classes are still used everywhere (including inside dashboard surfaces) for
layout, spacing and one-off styling — only the *component primitives* (buttons, tables, forms,
etc.) follow this split.

#### Performance isolation (required, not optional)
Ant Design must never inflate the bundle that public/auth visitors download.
- Route-level code splitting: lazy-load (`React.lazy` / dynamic `import()`) the `/app/*`,
  `/instructor/*`, and `/admin/*` route trees as separate chunks. The landing/catalog/auth bundle
  must not contain AntD at all — verify this with a production bundle analysis, not by assumption.
- Import AntD components directly per-component (`import { Table } from 'antd'`) and rely on
  AntD v5's own per-component CSS-in-JS — do not import the whole `antd` namespace object or a
  global AntD stylesheet.
- Use `@ant-design/icons` only inside the dashboard chunks; keep `lucide-react` as the only icon
  set on public/auth pages. Don't ship two icon libraries to the same page.
- Check for CSS conflicts between Tailwind's preflight reset and AntD's injected styles when both
  are present in a dashboard page (they will be, since Tailwind utilities are still used there);
  fix any visual regression rather than disabling Tailwind's reset globally.
- Re-run a bundle-size check after finishing each of Phase 6 (instructor) and Phase 7 (admin) in
  `01-project-steps.md` — don't defer this to the very end where it's harder to isolate which
  addition caused a regression.

## 3. Folder structure

```
src/
  app/              # store, root baseApi (RTK Query), router setup
  layouts/           # PublicLayout, AppLayout, InstructorLayout, AdminLayout
  routes/            # route table + guard components
  components/        # shared design-system primitives (Phase 1 of steps.md)
  features/
    auth/
    catalog/
    courseDetails/
    checkout/
    library/
    player/
    orders/
    profile/
    instructorApplication/
    instructorCourses/
    instructorCurriculum/
    adminApplications/
    adminCourses/
    adminCategories/
    adminOrders/
  lib/               # api error handling, money/duration formatters, validation schemas
  types/             # TS types mirroring the API DTOs in frontend-handoff.md
```
Each `features/<x>` folder owns its own RTK Query endpoints (injected into the root `baseApi`), its
screens, and its local components. Don't scatter one feature's API calls across multiple folders.

## 4. API & data rules

- All server state lives in RTK Query. No component keeps its own copy of server data in
  `useState`/a Redux slice "just in case" — if it comes from the API, it's a query/mutation.
- `baseApi` re-auth recipe (RTK Query's standard pattern): wrap `fetchBaseQuery` so that on a 401
  response it calls `/auth/refresh` once (`credentials: 'include'`), retries the original request
  with the new in-memory access token on success, and on failure clears auth state and redirects
  to `/login`. Coordinate concurrent refreshes through a single in-flight promise — never fire two
  parallel refresh calls.
- The access token lives in memory (Redux state) only. **Never** write it, or the refresh cookie,
  to `localStorage`, `sessionStorage`, or any client log. The refresh token is an HttpOnly cookie
  you never touch directly.
- `credentials: 'include'` only on login/refresh/logout calls per the handoff doc; everything else
  uses the Bearer header.
- On logout, call `api.util.resetApiState()` (or the equivalent) to drop every cached query —
  never let a previous user's cached data leak into the next session on the same browser.
- Mirror every client-side validation rule to the exact backend constraint, not an approximation:
  password 8–72 UTF-8 bytes; bio 50–2000 chars; expertise 2–200 chars; links ≤5, unique, HTTPS
  only; rejection reason 5–500 chars; `shortDescription` empty-while-drafting or 10–300 chars;
  `requirements`/`learningOutcomes` ≤30 unique strings each; lesson `description` ≤10000 chars.
  When the backend returns `400 VALIDATION_ERROR`, show its `details` field-by-field rather than a
  generic message.
- Never send fields the API explicitly forbids (e.g. `roles`/`status` on register, `slug`/
  `instructorId`/`coverKey` on course create, `avatarUrl`/`avatarAssetId` on profile PATCH,
  `studentId`/`sourceOrderId`/`price` on enrollment). Sending extra fields "just in case" is a bug,
  not defensive coding.
- Respect every `429 Retry-After` header before re-issuing the same call. Never build a
  client-side retry loop that ignores it.
- Durations from the API are in **seconds** — always format for display, never show raw seconds or
  treat a `null` total as `0`.
- Prices are integers in the smallest EGP unit — format for display, never do float math on them,
  never persist a re-derived float.

## 5. Routing

Use this map. Extend it only by adding leaf routes inside an existing guarded branch — never
invent a new top-level branch or a new guard tier without updating this file first.

| Path | Guard | Notes |
|---|---|---|
| `/` | public | Landing |
| `/courses` | public | Catalog |
| `/courses/:slug` | public | Details; preview playback only |
| `/instructors/:instructorId` | public | Public instructor profile |
| `/login`, `/register` | public, redirect away if already authenticated | |
| `/verify-email`, `/forgot-password`, `/reset-password` | public | Read `?token=`, strip it from the URL bar immediately after reading, never store it |
| `/app/dashboard` | authenticated (any verified role) | |
| `/app/my-courses`, `/app/my-courses/:courseId` | authenticated | Library + learning outline |
| `/app/my-courses/:courseId/learn/:lessonId` | authenticated + active enrollment (server-checked) | Player |
| `/app/orders`, `/app/orders/:orderId` | authenticated | Scoped server-side to the caller; a 404 here means "not yours or doesn't exist" — never say which |
| `/app/profile` | authenticated | |
| `/instructor/apply`, `/instructor/application-status` | authenticated, non-instructor only for `apply` | |
| `/instructor/dashboard`, `/instructor/courses*`, `/instructor/profile` | role = instructor (approved) | |
| `/admin/*` | role = admin | |

### Guard rules
- A guard reads the role from the **fetched `user` object** (from `GET /users/me`, refreshed on
  every login/refresh), never from the URL, a route param, or a locally cached assumption.
- Every guarded layout re-checks auth on mount — including a hard page refresh, not only on the
  initial client-side navigation. No guard may rely purely on in-memory state surviving a reload.
- 401 on a guarded route → one silent refresh attempt → still 401 → clear state, redirect to
  `/login?redirect=<original path>`, restore that path after successful login.
- 403 on a guarded route or an individual API call → a permission-denied view or inline message.
  Never retry automatically, never treat it the same as a 401.
- **Route security — no URL tampering to reach data that isn't the user's:** dynamic `:id`
  segments (`:courseId`, `:orderId`, `:lessonId`, `:applicationId`) are never trusted client-side.
  The frontend always calls the scoped, authenticated endpoint for the current user
  (`/users/me/courses/:courseId`, `/users/me/orders/:orderId`, etc.) and renders exactly what that
  endpoint returns — a 404 from a non-owned ID is shown as "not found," never distinguished from a
  truly nonexistent ID, and never worked around by trying an admin/instructor endpoint instead
  unless the current user actually holds that role.
- Hiding a nav link or a button for a role that can't use it is a UX nicety, not a security
  boundary — the real boundary is always the server's 403. Don't write comments or logic implying
  client-side hiding alone is sufficient.

## 6. Authentication & authorization summary

- Register → "check your email" screen → verify via `?token=` → login.
- Login keeps the access token in memory + fetches `user`; refresh rotates it transparently.
- Forgot/reset password always shows the identical "check your email" UI regardless of whether the
  account exists, is suspended, or isn't verified — never branch the UI on that.
- `403 ACCOUNT_SUSPENDED` / `401 INVALID_REFRESH_TOKEN` / `401 AUTHENTICATION_REQUIRED` after a
  failed refresh → clear all local auth state and send the user to `/login` with a clear message;
  don't leave a half-authenticated UI state hanging around.
- Instructor status is a role unlocked by admin approval — the frontend never assumes "approved"
  from the application UI alone; it always re-reads the role from the user object after a refresh.

## 7. Testing scope

- Write **unit tests** (Vitest + React Testing Library) for: shared UI components from Phase 1,
  validation schemas/formatters in `lib/`, and the RTK Query re-auth wrapper logic.
- Everything else (full screen flows, end-to-end purchase/learning/review journeys, responsive
  behavior) is verified **manually** against the checklist items in `03-progress-tracker.md` — do
  not spend time building Playwright/e2e infrastructure for this project.
- A screen wired only to mock data is never marked done — per the handoff rules, a feature is done
  only once it works against the real API on a shared/staging environment.

## 8. General conduct

- Work phase by phase from `01-project-steps.md`. Don't jump ahead to a later phase's screens
  because they look easier or more interesting.
- Update `03-progress-tracker.md` after every completed task, not in a batch at the end of a
  session.
- When genuinely blocked (missing endpoint, ambiguous design, conflicting instruction), don't
  silently pick an interpretation and keep going — write it under "Blocked / needs confirmation" in
  the progress tracker and continue with the next unblocked task instead of stalling entirely.
- Don't delete or rewrite a prior session's finished work "to clean it up" unless a rule or the
  project owner explicitly asked for that.
