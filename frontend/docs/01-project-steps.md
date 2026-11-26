# Pathly — Frontend Build Plan (for the AI Agent)

> Read this file after `02-agent-rules.md` and `04-design-system.md`. This is your phased execution
> plan. Work phase by phase, in order. Do not start a phase before the previous one's "Exit
> criteria" are all true. After finishing any task, immediately update `03-progress-tracker.md`
> before moving to the next task — do not batch updates.

## 0. What this project is

**Pathly** is an e-learning marketplace (Egyptian market). Students browse and buy courses,
instructors publish and sell courses, admins moderate and manage settlements. The **backend is
already built and frozen** — you are building the **frontend only**, against the existing API.

- API contract: `frontend-handoff.md` (provided alongside these files) + the live Swagger doc at
  `https://app.swaggerhub.com/apis-docs/depi-979/e-learning-marketplace-api/2.0.0`.
- Business flow / state machine source of truth: `flowchart.pdf` (provided alongside these files).
- Visual source of truth: `04-design-system.md`.
- You are **not** allowed to add, change, or assume any backend endpoint, field, or behavior that
  isn't written in `frontend-handoff.md` or the Swagger doc. If something in the flowchart implies
  a feature with no matching endpoint (see "Known gaps" below), stop building that one feature,
  log it in `03-progress-tracker.md` under "Blocked / needs confirmation", and move to the next task.

### Known gaps to flag, not invent
- The flowchart's admin "manage users" screen **does** have a real backend module (`adminUsers`
  — confirmed via `backend-src-guide.html`), it's just not in `frontend-handoff.md`. Build it in
  Phase 7, but read its actual request/response contract from Swagger first — see
  `02-agent-rules.md §1.1`. The same applies to course revisions/administration, refunds,
  earnings, payouts, and the finance dashboards — all real, none fully documented in the handoff
  doc, all needing a direct Swagger check before you build their screens.
- Certificates, chat, live streaming, subscriptions, coupons, advanced quizzes, and native mobile
  apps are explicitly **out of scope** for this build (see Project_Plan.md §1.2). Do not build UI
  for them. ("Automatic instructor payouts" is out of scope in the sense of an automatic bank
  transfer — the manual settlement *lifecycle* itself, driven by the `payouts` module, is in
  scope; see the new phase below.)
- The `operations` module (financial preflight, sale migration, restore reconciliation) is
  backend-internal tooling — no frontend screen for it.

## 1. Tech stack (locked — see `02-agent-rules.md` for the full rationale)

React + TypeScript + Vite + Redux Toolkit (RTK Query for all server state) + Tailwind CSS +
lucide-react icons. Tailwind + shadcn/ui build every public/auth screen; Ant Design (re-themed,
code-split per route) builds every screen behind an authenticated guard (student/instructor/admin
areas). See `02-agent-rules.md §2` for the exact boundary and the required performance isolation.

## 2. Build order

### Phase 0 — Project scaffolding
**Goal:** a running, empty shell with the right tooling, no business logic yet.
- `npm create vite@latest` (react-ts template), install Tailwind, shadcn/ui, Ant Design,
  Redux Toolkit + RTK Query, React Router, lucide-react, a schema-validation library (zod) for
  forms, react-hook-form.
- Apply the design system: Tailwind config tokens (colors, radii, spacing, shadows, font) exactly
  as listed in `04-design-system.md`. Import Inter font. Set up the shadcn theme to read the same
  CSS variables. Separately, set up an AntD `ConfigProvider` theme (tokens + per-component
  overrides) mapped to the exact same values — both must render identically, see
  `02-agent-rules.md §2`.
- Set up route-level code splitting (`React.lazy`) for the `/app/*`, `/instructor/*`, and
  `/admin/*` branches from the start, so AntD only ever loads inside those chunks.
- Base folder structure (see `02-agent-rules.md` §Folder structure).
- `.env` with `VITE_API_BASE_URL` pointing at `<backend-origin>/api/v1`. Never hardcode the origin
  elsewhere.
- Base RTK Query `baseApi` with `fetchBaseQuery`, `credentials: 'include'`, Bearer header
  injection from in-memory auth state, and a re-auth wrapper that calls `/auth/refresh` on a 401
  exactly once before giving up (see agent rules for the full recipe).
- App shell routing skeleton: layouts registered, guards stubbed (always-allow for now), 404 page.
- Brand: logo icon from Figma + "Pathly" wordmark in the navbar/footer/auth panel. No "EduFlow"
  text anywhere.

**Exit criteria:** app boots, shows the public landing page shell with the real design tokens and
the Pathly brand, Tailwind + shadcn + AntD are visibly consistent (no default-blue AntD button
sitting next to a teal shadcn button), ESLint/TS build is clean.

### Phase 1 — Shared UI kit (two kits, one visual result)
**Goal:** build the reusable primitives once, against the design system, before any screen uses
them. Build these as two separate kits per `02-agent-rules.md §2` — don't let the two mix.

**Public/auth kit (`src/components/public/`, Tailwind + shadcn):** `button-primary` / `-lg`,
`button-secondary`, `button-outline`, `link-action`, `input` (focus/invalid states),
`search-field`, checkbox, `category-tile`, `course-card`, `purchase-card`, `instructor-card`,
`auth-shell`, `category-tag`, `filter-chip`, toast, empty-state, loading skeleton, error-state
card, modal.

**Dashboard kit (`src/components/dashboard/`, Ant Design, re-themed via `ConfigProvider`):**
button variants, form inputs, `metric-card` (AntD `Statistic`/`Card`), `learning-course-row`,
`student-course-card`, `progress-bar` (AntD `Progress`, re-themed), `curriculum-section` + lesson
row states, `data-table` (AntD `Table`), `status-badge-paid` (AntD `Tag`), `segmented-filter`
(AntD `Segmented`), app-shell layout (AntD `Layout` + `Sider` + `Menu`), toast/notification, modal,
upload progress UI.

**Exit criteria:** every component in `04-design-system.md §Components` exists in the matching kit
with props covering its documented states (hover/focus/invalid/active), and a public-kit component
next to a dashboard-kit component of the same type (e.g. both button styles) are visually
indistinguishable. A quick local showcase (a temporary `/dev/components` route is fine) renders
both kits side by side to confirm this. Delete the showcase route before Phase 9 if you added one.
Confirm via a production build that the dashboard kit's AntD code isn't present in the
public/auth bundle (see the performance isolation rule).

### Phase 2 — Auth & session
**Goal:** register → verify email → login → refresh → logout → forgot/reset password → basic
profile, fully wired to the real API, with the session/role state other phases depend on.
- Screens: `/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`,
  "check your email" screens (post-register and post-forgot-password; same screen on success for
  the forgot-password case — backend intentionally returns identical responses, do not leak
  whether the account exists).
- Auth state slice: `accessToken` (memory only, never persisted to storage), `user` (from
  `GET /users/me`), `status`. Populate `user` right after login and after every refresh.
- Wire the full error-code table from `frontend-handoff.md` for every auth endpoint.
- `GET/PATCH /users/me` basic profile screen (`/app/profile`).

**Exit criteria:** a fresh account can register, verify, log in, see its name on `/app/profile`,
edit it, log out, and reset a forgotten password end-to-end against the real staging API.
Refresh-on-expiry works without the user noticing. Logging out clears the RTK Query cache.

### Phase 3 — Route guards & role-based app shell
**Goal:** the route map and guard logic from `02-agent-rules.md §Routing` fully enforced,
*before* building the screens that sit behind it.
- `PublicLayout`, `AppLayout` (authenticated area, top bar + sidebar), `InstructorLayout`,
  `AdminLayout`, each with the correct guard.
- Guard reads role from the fetched `user` object only — never from the URL, never assumed.
- 401 → silent refresh → login redirect (preserve intended path). 403 → permission-denied view,
  no retry loop.

**Exit criteria:** navigating directly to `/instructor/dashboard` as a plain student redirects or
shows permission-denied (not a blank page or a crash); same for `/admin/*`; logging out from any
page lands on `/login` and blocks all app routes immediately.

### Phase 4 — Public catalog & course details
**Goal:** anonymous browsing, matching `GET /courses` and `GET /courses/:slug`.
- Landing page (hero, popular categories, popular courses, instructor-invitation panel).
- `/courses` catalog: search (title prefix, not fuzzy — don't build a fuzzy UX), category filter,
  pricing filter (all/free/paid), pagination, active-filter chips.
- `/courses/:slug` details: intro, learning outcomes, prerequisites, curriculum outline (durations
  formatted from seconds; `unknownDurationCount`/null total handled per the handoff doc, never
  shown as `0`), instructor card, sticky purchase card, free-preview playback for preview lessons
  only (via the S2-10 endpoint, anonymous allowed only for preview).
- `/instructors/:instructorId` public profile.

**Exit criteria:** catalog and details pages work fully logged-out, respect the real pagination and
filters, and a preview lesson plays without login while a non-preview lesson correctly refuses
anonymous playback.

### Phase 5 — Purchase, library & learning
**Goal:** the core money + learning loop, Sprint-2-equivalent in scope.
- Checkout: `POST /courses/:courseId/checkout` → redirect to `data.checkoutUrl`; success/cancel
  return pages that **poll the saved order id** (5s → back off to 30s → stop at 2 minutes, manual
  refresh after) instead of trusting the redirect itself. Never show "enrolled" from the redirect
  alone.
- Free enrollment: `POST /courses/:courseId/enroll`.
- `/app/dashboard` (metric cards, continue-learning rows, recommended grid).
- `/app/my-courses` (library, in-progress/completed segmented filter) and `/app/my-courses/:courseId`
  (learning outline with progress).
- Video player (`/app/my-courses/:courseId/learn/:lessonId` or similar — finalize the exact param
  shape yourself and record it in the routing table once decided): curriculum sidebar with
  completed/current/future states, resources tab, attachment downloads via the S2-10 signed URL
  (open directly, renew on expiry, never persist), mark-complete and last-lesson calls against the
  S2-11 endpoints.
- `/app/orders` (order history table) and `/app/orders/:orderId`.

**Exit criteria:** a student can buy a paid course in Stripe test mode, land back on the app, see
the order settle to Paid without manual reload (via polling), open the course, watch a preview and
a protected lesson, download an attachment, mark lessons complete, and see progress persist on
reload. Attempting to open a course never purchased returns a clean "not available" state, not a
leaked error.

### Phase 6 — Instructor journey
**Goal:** application → approval → course authoring → review → publish, plus earnings visibility.
- `/instructor/apply` (bio 50–2000, expertise 2–200, up to 5 unique HTTPS links) and
  `/instructor/application-status`.
- `/instructor/dashboard`.
- Course list + draft creation (`/instructor/courses`, `/instructor/courses/new`).
- Course editor (`/instructor/courses/:courseId/edit`): all draft-only fields, category picker
  (active categories only), cover upload via upload-intent → direct upload → confirm.
- Curriculum editor (`/instructor/courses/:courseId/curriculum`): sections + lessons, drag-reorder
  that always resends the full sibling id set, lesson video upload (Mux flow: request upload →
  hand URL to uploader → poll/reload for `videoStatus` — never call the webhook from the browser),
  PDF attachment upload, preview flag.
- Submit for review, rejection reason display, reopen-and-resubmit flow, "unavailable" state
  display when Mux deletes a video.
- `/instructor/profile` (bio/expertise/links, partial PATCH semantics).
- Earnings/sales/settlements belong to Phase 8 (`instructorFinance`) — don't build a separate
  earnings view here.

**Exit criteria:** a full course (draft → sections → lessons → video ready → submitted → approved)
can be created end-to-end by an instructor account against the real API, and a rejected course can
be reopened, fixed, and resubmitted.

### Phase 7 — Admin journey
**Goal:** moderation and oversight screens. The core review/category/order endpoints are in
`frontend-handoff.md`; `/admin/users` and course-administration actions are real but need a
Swagger lookup first (see `02-agent-rules.md §1.1`).
- `/admin/dashboard`.
- `/admin/instructor-applications` (list + filter by status) and detail/approve/reject.
- `/admin/courses` (pending review list), detail, approve/reject with reason.
- `/admin/courses/:courseId/revisions` — review a pending revision of an already-published course
  (distinct from a brand-new pending-review draft; both land on the admin review surface, make
  sure the UI distinguishes "new course" vs "revision of a published course").
- `/admin/courses/:courseId` admin actions: archive, and the independent legal/security block
  (`courseAdministration` — confirm the exact action names/body in Swagger; don't assume they
  mirror the instructor-facing reopen/resubmit flow).
- `/admin/categories` (list all, create, PATCH, archive via `isActive:false`).
- `/admin/orders` (list + detail, read-only, includes commission split).
- `/admin/users` (`adminUsers` module): search/list users, suspend/reactivate an account, revoke a
  user's sessions. The backend protects the last remaining admin from being demoted/suspended —
  surface that as a real, expected error state, not a bug.

**Exit criteria:** an admin account can review and decide a real instructor application, a real
pending course, and a real published-course revision end-to-end; manage categories; suspend and
reactivate a real test user account; and confirm the last-admin protection actually blocks the
action in the UI, all against the live API.

### Phase 8 — Earnings, payouts, refunds & published-course revisions
**Goal:** the financial loop that sits on top of Phase 5/6/7, and the revision path for editing a
course that's already live. None of this is in `frontend-handoff.md` — read every contract from
Swagger first.
- **Student refund:** a refund-request action on an owned order (`/app/orders/:orderId`), within
  the policy window; show its resulting state (pending/approved/denied) once the backend returns
  it — never assume approval from the request alone.
- **Instructor finance (`instructorFinance`):** a dashboard surface under `/instructor/*` —
  summary, sales, earnings ledger movements, settlement/payout history. Build this instead of the
  placeholder "earnings/sales view" mentioned in Phase 6 — don't build both.
- **Admin finance (`adminFinance`):** platform-wide financial summary and per-instructor view
  under `/admin/*`.
- **Payouts (`payouts`), admin side:** the settlement lifecycle screens — preview, draft, confirm
  (mark paid, with the external transfer reference recorded per Project_Plan.md §6.1), cancel,
  reconciliation view. Match whatever states the API actually exposes; don't invent extra ones.
- **Refunds, admin side (`refunds`):** review/decide pending refund requests.
- **Published-course revisions, instructor side (`courseRevisions`):** editing a published course
  must go through this module, not the draft-only PATCH used in Phase 6. A minor edit may apply
  immediately; a major edit (price/curriculum) creates a revision that goes back to pending
  review while the live version stays available to enrolled students — confirm the exact
  minor/major boundary and request shape in Swagger, don't assume it matches the draft editor.

**Exit criteria:** a real refund request moves from pending to a decided state end-to-end; an
instructor can see real earnings/payout history; an admin can run a full settlement
(preview → draft → confirm) and resolve a refund; and editing a published course produces a
revision that an admin reviews separately from new-course review, without ever hiding the
already-published version from students mid-review.

### Phase 9 — Cross-cutting hardening
- Responsive pass against `04-design-system.md §Responsive Strategy` for every screen built so far.
- Every list/detail screen has loading, empty, and error states (no bare spinners forever, no
  silent blank screens).
- Full pass of the error-code table in `frontend-handoff.md` — every documented code has a real,
  user-visible handling path somewhere in the app, not just a generic toast.
- Security pass: confirm no sensitive token/URL is logged or persisted anywhere (check browser
  storage, console, network tab); confirm every guarded route re-checks auth on hard refresh;
  confirm UI never fabricates an "enrolled"/"approved"/"paid" state ahead of a real API response.
- Remove any temporary/dev-only routes left over from earlier phases.

### Phase 10 — Test pass
Follow the testing scope in `02-agent-rules.md §Testing`. Do this last, against the finished
screens, not continuously from Phase 0 — don't block feature phases on test-writing.

## 3. Resuming after an interruption

Every time you (re)start work on this project:
1. Open `03-progress-tracker.md` first. Find the last task marked done and the first unchecked one.
2. Re-run/re-open the last 2–3 "done" items yourself before trusting them — a cut-off session may
   have marked something done without finishing it.
3. Continue from the first real unchecked task. Do not restart from Phase 0 unless the tracker
   says Phase 0 itself is incomplete.
4. If the tracker and the actual code disagree, the code wins — fix the tracker, add one line
   under "Session notes" explaining the discrepancy, and continue.
