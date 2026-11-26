# Pathly — Progress Tracker

> This is the single file that tells you (or a future session of you) exactly where this project
> stands. Read it FIRST, before touching any code, every time you start or resume work.

## How to resume (read this every time)

1. Scroll to the first unchecked `[ ]` box below. Everything above it is claimed done.
2. Don't trust that claim blindly — re-open and re-verify the **last 2–3 checked items** yourself
   (run the app, click through the flow, check the network tab) before building on top of them. A
   session can be cut off mid-task and still have left a box checked by mistake.
3. Continue from the first real unchecked task, in order. Don't skip ahead to a later phase.
4. If what you find in the code contradicts this file, the **code is reality** — fix this file to
   match it, add one line to "Session notes" explaining the mismatch, and continue.
5. After finishing any single task, check its box immediately. Don't wait and batch-update at the
   end of a session — if the session ends unexpectedly, unupdated work looks like it never happened.
6. Never mark a task done if it only works against mock data — see `02-agent-rules.md §7`.

---

## Phase 0 — Project scaffolding
- [ ] Vite + React + TS project created
- [ ] Tailwind installed and configured with `04-design-system.md` tokens (colors, radii, spacing,
      shadows, Inter font)
- [ ] shadcn/ui installed, themed to the same tokens
- [ ] Ant Design installed, `ConfigProvider` themed to the same tokens (no default blue visible
      anywhere)
- [ ] Redux Toolkit + RTK Query `baseApi` set up with `VITE_API_BASE_URL`
- [ ] Re-auth wrapper (401 → refresh-once → retry) implemented and manually tested
- [ ] React Router installed; layouts + guard stubs in place (always-allow for now)
- [ ] Pathly logo icon + wordmark in navbar/footer/auth panel; no "EduFlow" text remains anywhere
- [ ] Lint + TypeScript build clean

## Phase 1 — Shared UI kit
- [ ] Buttons: primary, primary-lg, secondary, outline, link-action
- [ ] Inputs: text input (default/focus/invalid), search-field, checkbox
- [ ] `category-tile`, `course-card`, `category-tag`, `filter-chip`, `segmented-filter`
- [ ] `metric-card`, `learning-course-row`, `student-course-card`
- [ ] `purchase-card`, `instructor-card`, `auth-shell`
- [ ] `progress-bar`, `curriculum-section` + lesson row states (completed/current/future)
- [ ] `data-table` (AntD, re-themed), `status-badge-paid`
- [ ] Toast, empty-state card, error-state card, loading skeleton, modal
- [ ] Temporary showcase route removed (or none was created)
- [ ] Unit tests: shared components render and reflect their documented states

## Phase 2 — Auth & session
- [ ] Register + "check your email" screen
- [ ] Verify-email flow (`?token=` read, stripped from URL, never stored)
- [ ] Login (token in memory, `user` fetched and stored)
- [ ] Forgot/reset password (identical UI regardless of account state)
- [ ] Logout + logout-all; cache cleared on logout
- [ ] `/app/profile` view + edit (name only, per the API)
- [ ] Full error-code table wired for every auth endpoint used so far
- [ ] Manually verified end-to-end against the real staging API (not mocks)

## Phase 3 — Route guards & app shell
- [ ] `PublicLayout`, `AppLayout`, `InstructorLayout`, `AdminLayout` built
- [ ] Guards read role from fetched `user`, not the URL
- [ ] 401 → silent refresh → redirect-with-return-path works
- [ ] 403 → permission-denied view, no retry loop
- [ ] Direct URL to a role-guarded route without permission verified to fail safely (manually
      tested with a plain student account against `/instructor/*` and `/admin/*`)
- [ ] Hard refresh on a guarded route re-checks auth (doesn't trust stale in-memory state)

## Phase 4 — Public catalog & course details
- [ ] Landing page (hero, categories, popular courses, instructor-invitation panel)
- [ ] `/courses` catalog: search, category filter, pricing filter, pagination, filter chips
- [ ] `/courses/:slug` details: intro, outcomes, prerequisites, curriculum outline, instructor card,
      purchase card
- [ ] Duration formatting correct (seconds → display; null total never shown as 0)
- [ ] Preview lesson plays anonymously; non-preview lesson correctly refuses anonymous playback
- [ ] `/instructors/:instructorId` public profile

## Phase 5 — Purchase, library & learning
- [ ] Checkout redirect + success/cancel pages implement the 5s→30s→2min polling rule
- [ ] Free enrollment flow
- [ ] `/app/dashboard` (metrics, continue-learning, recommended)
- [ ] `/app/my-courses` library with segmented filter
- [ ] `/app/my-courses/:courseId` learning outline with live progress
- [ ] Video player: curriculum sidebar states, resources tab, signed attachment download
- [ ] Mark-lesson-complete and last-lesson calls wired to S2-11 endpoints
- [ ] `/app/orders` + `/app/orders/:orderId`
- [ ] End-to-end manual test: real Stripe-test purchase → settles to Paid → learn → progress
      persists on reload

## Phase 6 — Instructor journey
- [ ] `/instructor/apply` + `/instructor/application-status`
- [ ] `/instructor/dashboard`
- [ ] Course list + draft creation
- [ ] Course editor (draft-only fields, active-category picker, cover upload)
- [ ] Curriculum editor: sections/lessons CRUD, full-sibling-id reorder, video upload flow,
      attachment upload, preview flag
- [ ] Submit for review, rejection display, reopen-and-resubmit, "unavailable" state display
- [ ] `/instructor/profile`
- [ ] Earnings/sales view limited strictly to documented fields
- [ ] End-to-end manual test: draft → curriculum → submit → admin-approve → published, on a real
      instructor account

## Phase 7 — Admin journey
- [ ] `/admin/dashboard`
- [ ] Instructor applications list + approve/reject
- [ ] Course review list (new drafts) + approve/reject with reason
- [ ] Course **revision** review list (edits to already-published courses), shown distinctly from
      new-course review
- [ ] Course administration: archive action; independent legal/security block action
- [ ] Categories: list, create, PATCH, archive
- [ ] Orders: list + detail (read-only)
- [ ] `/admin/users`: search/list users; suspend; reactivate; revoke sessions; last-admin
      protection verified to actually block the action in the UI

## Phase 8 — Earnings, payouts, refunds & published-course revisions
- [ ] Student refund-request action on an owned order, with its real resulting state shown
- [ ] Instructor finance dashboard (summary, sales, earnings ledger, settlement/payout history)
- [ ] Admin finance dashboard (platform-wide + per-instructor)
- [ ] Admin payout lifecycle: preview, draft, confirm (with transfer reference), cancel,
      reconciliation view
- [ ] Admin refund review/decision screen
- [ ] Instructor published-course revision flow (minor edit live-immediately vs major edit →
      pending review, live version still visible to students during review)
- [ ] End-to-end manual test: a real refund request reaches a decided state; a real settlement
      runs preview → draft → confirm; a real published-course major edit creates a reviewable
      revision

## Phase 9 — Cross-cutting hardening
- [ ] Responsive pass (mobile/tablet/laptop/desktop) on every screen built
- [ ] Loading/empty/error states present on every list/detail screen
- [ ] Every documented error code has a real handling path somewhere in the app
- [ ] Security pass done (see checklist below)
- [ ] All temporary/dev-only routes removed

### Security pass checklist (Phase 9)
- [ ] No access token / refresh cookie / sensitive URL ever appears in `localStorage`,
      `sessionStorage`, or console logs
- [ ] Every guarded route re-authenticates on hard refresh
- [ ] Tried editing a URL `:id` param to another user's course/order/lesson while logged in as a
      different account — confirmed the app shows "not found", not someone else's data
- [ ] Tried accessing `/instructor/*` and `/admin/*` as a plain student — confirmed blocked both by
      guard and by a real 403 from the API, not just hidden nav

## Phase 10 — Test pass
- [ ] Unit tests for shared UI components
- [ ] Unit tests for validation schemas / formatters
- [ ] Unit tests for the re-auth wrapper (401 → refresh → retry, and the failure path)
- [ ] Manual QA pass completed against every checklist item above that wasn't already verified
      in-phase

---

## Blocked / needs confirmation
_(Add one line per item. Don't leave these silently unresolved — surface them to the project
owner.)_

- ~~Admin "manage users" endpoint~~ — resolved: confirmed to exist (`adminUsers` module per
  `backend-src-guide.html`), just undocumented in `frontend-handoff.md`. Contract pulled from
  Swagger before building Phase 7.
- `courseRevisions`, `courseAdministration`, `refunds`, `earnings`, `payouts`, `instructorFinance`,
  `adminFinance` (Phase 8 and parts of Phase 7): confirmed to exist, but no request/response
  contract is documented anywhere handed to the frontend team. Each one's exact fields/states must
  be pulled from the live Swagger doc before building its screen — log here any case where the
  Swagger doc itself is unclear or missing for one of these.

## Session notes
_(One short dated line per session: what you did, anything you changed your mind about, anything
that didn't match this file when you checked it.)_

-
