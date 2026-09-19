# Agile Implementation Plan for the Educational Platform

## Agile Project Plan | 6 Weeks

Our goal is to deliver the agreed MVP scope within 6 weeks through 3 development cycles, each lasting two weeks. The new team: 3 frontend developers, 1 backend developer, and 1 UI/UX designer. Each cycle includes design, implementation, integration, testing, and a demo of a working part of the product.

| Decision | Revised Plan |
|---|---|
| Product | Marketplace for courses registered in Egypt using MERN. |
| Team | FE1 + FE2 + FE3 + BE1 + UX1 |
| Duration | 6 weeks from the actual start date: 3 Sprints. |
| Delivery | Integrated MVP on Staging with test Stripe payment and an operating guide. |
| Commission | 20% for the platform and 80% for the instructor; monthly manual settlements. |
| Plan Status | Duration and team distribution as requested; the hours and following estimates are assumptions that need review. |

## 1 Conditions for Achieving the Goal

Six weeks is an ambitious target with one backend developer. Agile helps us identify delays and adjust priorities early, but it does not automatically reduce the amount of work. The attached file assumes 20 hours per week for each person. We keep this baseline, but the capacity estimate in Section 7 shows a backend shortfall. One possible option to meet the target is to increase BE1 availability to about 35 hours per week, if possible, with practical experience and ready-made services for email, video, and payments; this is not an availability commitment from the team.

- Freeze the scope during the first two days; do not add new features during the sprint except after reviewing their impact.
- Test the video and payment services early and start integration in week one; do not leave all integration until the end.
- If backend capacity is not confirmed by the end of week one, re-estimate the date or propose a simplification that you approve; do not silently remove agreed features.

### 1.1 What We Mean by Project Completion

Project completion here means completing, testing, and delivering the agreed initial release, including accounts, content, purchasing, learning, management, and earnings. Commercial launch is conditional on a qualified payment gateway, operations, and policies being ready; completion of the test version does not prove readiness for real payments.

### 1.2 What Remains Outside the Release

Certificates, chat, live streaming, subscriptions, coupons, advanced tests, automatic transfers to instructors, and native mobile applications. The new schedule does not change these boundaries.

Project Plan | v2.0 | 1

---

# 2 Team Allocation and Preventing Backend Bottlenecks

| Member | Responsibility | Core Outputs |
|---|---|---|
| BE1 | Backend, database, security, and full business logic. | Auth, courses and media, review, orders and payment, enrollment and progress, earnings and settlements. |
| FE1 | Public interfaces and the student journey. | Registration and profile, search and details, purchase, library, player, and progress. |
| FE2 | Instructor journey. | Application to join, course editor, sections and lessons, upload, review tracking, sales and earnings. |
| FE3 | Admin journey and shared frontend infrastructure. | Users, categories, review, orders and settlements; setup of API client, Mocks, and shared-journey tests. |
| UX1 | Design and usability testing. | Role flows, design system, implementation screens, and error states, followed by review of each delivery. |

## 2.1 Collaboration Rules

- BE1 defines the API contract before implementing a feature; FE3 builds matching Mocks, and the frontend works until integration becomes available.
- Backend requests are collected in one list ranked by value and dependencies. Current backend work is limited to one main feature, with critical bugs handled immediately.
- FE1, FE2, and FE3 write acceptance cases and frontend journey tests, and prepare demo data and documentation to reduce the load on BE1; they do not handle payment or security logic without relevant experience.
- FE3 reviews the backend contract, API behavior, and integration tests. Payment security and permissions review requires a qualified person; if unavailable within the team, it is recorded as a pre-production condition.

## 2.2 Task Ownership

Each task has one clear owner and one reviewer. FE1, FE2, and FE3 review each other's code, and UX1 approves interface consistency and usability. BE1 is responsible for backend logic integrity, and the team verifies acceptance criteria using different role accounts.

## 2.3 Product Management and Coordination

The team selects a product representative to decide the priority order, and a sprint coordinator to follow blockers. They may be current members; no additional people are added to the team. Meetings and coordination are counted within capacity, and no free extra hours are assumed.

Project Plan | v2.0 | 2

---

# 3 Agile Working Method

We use a lightweight approach inspired by Scrum: a clear goal for each Sprint, a prioritized work list, and a testable delivery every two weeks. Testing begins alongside implementation within each cycle, and product improvement continues based on feedback.

| Activity | Timing | Outcome |
|---|---|---|
| Sprint Planning | At the start of every two weeks; about 60 minutes. | Select the sprint goal and stories according to capacity and dependencies, and assign an owner for each task. |
| Daily Check-in | Daily: 10 to 15 minutes. | Progress toward the goal, the next step, and the blocker that needs intervention. |
| Backlog Refinement | Twice weekly: 20 to 30 minutes. | Clarify upcoming stories, the API contract, design, and estimates. |
| Sprint Review | End of sprint: 45 minutes. | Demo the working product and test it with the product representative, and record notes. |
| Retrospective | After the demo: 30 minutes. | Choose one or two improvements to the way of working in the next sprint. |

## 3.1 Task Board

Backlog, then Ready, then In Progress, then Review, then Testing, then Done. We use one board, filtered by member or journey. A stopped task remains visibly marked Blocked, with its reason and the person needed to resolve it written.

## 3.2 When a Task Becomes Ready

- A user story and testable acceptance criteria, with sufficient design or a clear behavior description.
- The request/response contract and permissions are known, dependencies are defined, and the estimate is appropriate for a small task from half a day to about two days.

## 3.3 When a Task Becomes Done

- The code is reviewed, the feature is connected to the backend, and it works on the shared environment, not only on the developer's device.
- The happy path, error path, and permissions are tested; the interface is responsive and documentation is updated.
- A screen that works only with Mock data is not a complete feature. If it is not completed, it returns to the Backlog and is not counted as a successful delivery.

## 3.4 Progress Tracking

Track completed stories, blocked tasks, critical defects, and the remaining estimate for BE1. Compare the remaining work with actual hours weekly. Any change affecting the sprint goal or delivery date is shown, then reviewed and approved by the product representative with the team.

Project Plan | v2.0 | 3

---

# 4 First Sprint from Week 1 to 2

Sprint 1 goal: a user registers, applies as an instructor and gets approved, and creates and saves a course draft. Also prove that the video, email, and test payment services are usable.

| Member | Week 1 | Week 2 |
|---|---|---|
| BE1 | Data model and Auth contract; set up login and permissions; email, video, and test Webhook trials. | Complete registration, email confirmation, and recovery; instructor application and approval; course, sections, and lessons draft. |
| FE1 | React setup, routing, and account screens, then initial connection to ready API. | Complete login, recovery, and profile; begin the catalog with Mock data. |
| FE2 | Instructor dashboard structure and join request; course editor using the contract. | Connect the instructor application and course-draft saving, sections and lessons, and validation states. |
| FE3 | Frontend repository, API client, error handling, and Mocks; admin dashboard structure. | Connect instructor acceptance and rejection; test role permissions and prepare test data. |
| UX1 | Quick research and role flows; design system and login and instructor-approval screens. | Design the editor, catalog, purchase, and player; review the sprint interfaces. |

## 4.1 Priority Stories

- As a student, I can create an account, confirm my email, log in, and reset my password.
- As a user, I submit an instructor application and see its status; as an admin, I accept or reject it with a reason.
- As an approved instructor, I create a course draft with at least one section and one lesson, and I reorder the content.

## 4.2 Last-Day Demo Test

A new account confirms its email, submits an instructor application; the admin enters and approves it; the instructor creates a draft and returns to open it after saving. The team tries an unauthorized account and sees the server reject the operation.

## 4.3 Early Decision Point

At the end of week one, review the actual backend hours and the results of service trials. If Auth, video, or the payment notification fails, address the blocker first and update the forecast. Do not postpone discovering these issues until week six.

Project Plan | v2.0 | 4

---

# 5 Second Sprint from Week 3 to 4

Sprint 2 goal: the instructor uploads content, the admin publishes the course, and the student buys it in test mode and starts learning with saved progress. This is the main journey that must work before any other sprint.

| Member | Week 3 | Week 4 |
|---|---|---|
| BE1 | Private upload; course publishing, categories, and search; start order and Checkout. | Confirm Webhook and prevent duplication; paid and free enrollment; protect access and progress; save the commission snapshot at the time of sale. |
| FE1 | Connect catalog, details, and preview; implement purchase, library, and player against the contract. | Connect payment, waiting, and failure; student library, player, and attachments; save progress. |
| FE2 | Connect video and attachments and lesson ordering; submit the course for review and show the rejection reason. | End-to-end content creation experience; sales and instructor-earnings interfaces with Mock data matching the contract. |
| FE3 | Connect categories and course acceptance/rejection; build orders and settlements against the contract. | Connect orders; purchase tests, event repetition, and permissions across journeys; help connect the interfaces. |
| UX1 | Review publishing/upload and purchase; deliver the design for admin, earnings, and settlements. | Test the learning and purchase journey with two potential users; prioritize usability problems. |

## 5.1 Rules That Cannot Be Shortened

- A successful payment page does not create Enrollment; the backend relies on a valid payment notification and verifies it.
- Resending the same notification does not create additional enrollment or profit. Amount and currency are stored at purchase time so old sales remain fixed.
- Paid video and attachments require explicit authorized access; hiding the link in the interface is not enough.
- Free enrollment works without a paid Order; progress is saved for each student; the student does not buy the same course twice by mistake.

## 5.2 Sprint Completion Criterion

A new course moves from upload to review and publishing, then a student buys it in Stripe Test Mode, watches a lesson, and keeps progress. Failure testing, notification repetition, and attempts to access without enrollment succeed. If this journey does not work by the end of week four, the remaining two-week plan becomes subject to immediate re-estimation.

Project Plan | v2.0 | 5

---

# 6 Third Sprint from Week 5 to 6

Sprint 3 goal: complete administration, earnings, settlements, and final acceptance, then deliver a stable version. We target feature completion by the end of week five, leaving week six for stabilization and delivery.

| Member | Week 5 | Week 6 |
|---|---|---|
| BE1 | Link earnings and eligibility; settlement ledger and reference; refund and reversal of the due; disable accounts; archive and admin logs. | Fix defects; payment and permission tests; backup and recovery; publishing and monitoring settings and rollback plan. |
| FE1 | Connect the student purchase record and refund/access states; test progress and phone. | Acceptance tests for the student journey; compatibility fixes; prepare the demo scenario. |
| FE2 | Connect instructor earnings, sales, and settlements; archived-course states and post-publish edits. | Instructor tests and upload/editor fixes; instructor user guide. |
| FE3 | Connect users, metrics, and settlements; test preventing the same due from being paid twice. | Admin tests; prepare the interface environment and demo data with BE1; admin guide. |
| UX1 | Review admin, numbers, empty states, and errors; initial acceptance test. | Final visual review; test the three roles; document postponed improvement notes. |

## 6.1 Settlement Cycle

A successful sale records the platform commission and the instructor due. Once the profit becomes eligible for settlement, it enters one settlement. The responsible person records the external transfer reference and confirms payment. In the trial, we use a simulated transfer and do not send real money. A refund cancels the due or records a negative effect if it has already been settled.

## 6.2 Delivery Tests

- The student, instructor, and admin execute the entire journey and the data effect is complete; disabling an account prevents non-permitted sessions and operations.
- Success, failure, and payment cancellation; repeated notification; refund before settlement and after it; no duplicate due in two settlements.
- Search, library, video, progress, and attachments work on phone and computer, with clear loading and error states.

## 6.3 Delivery Package

Published Staging version, organized repository, README, API contract, sample environment variables without secrets, demo data, acceptance results, operating and admin guide, backup and restore steps and rollback plan, and a demo scenario with a backup recording. Payment defects or data exposure must not be closed as future improvements.

Project Plan | v2.0 | 6

---

# 7 Capacity, Effort and Feasibility

Basis of the attached file: 20 hours per week per person for 6 weeks. We reserve 20% for meetings, review, and interruptions instead of assuming uncounted contingency inside a Sprint. Planned capacity becomes 96 hours per person, and we do not assume Agile automatically creates extra time.

| Specialization | Count | Available Hours | Planned After Buffer |
|---|---|---|---|
| Backend | 1 | 120 | 96 |
| Frontend | 3 | 360 | 288 |
| UI/UX | 1 | 120 | 96 |
| Total | 5 | 600 | 480 |

## 7.1 Initial Backend Hours Estimate

| Work Package | Hours |
|---|---|
| Setup, architecture, contract, and service trials | 22 |
| Accounts, permissions, and instructor application | 24 |
| Courses, upload, publishing, and search | 30 |
| Orders, payment, and duplicate prevention | 30 |
| Enrollment, access, and progress | 16 |
| Administration, earnings, settlements, and refunds | 24 |
| Final tests, deployment, and documentation | 22 |
| Planned Total | 168 |

These are preliminary planning estimates, not a confirmed productivity measurement. They include the main developer test package. A 168-hour backend estimate versus 96 hours of planned capacity means a 72-hour gap. Increasing frontend speed is not enough to solve this deficit. Each journey is re-estimated after the first week according to actual implementation, available services, and developer experience. Excess frontend time does not automatically compensate for backend tasks.

## 7.2 Options for Meeting the Schedule

To make 168 planned hours available in 6 weeks, BE1 needs about 35 hours per week with the same buffer. This is a proposed option, not an assumed change in team hours. If BE1 remains at 20 hours per week, this estimate points to about 11 weeks for the backend, or a smaller scope approved explicitly. Do not promise full scope in 6 weeks before resolving the capacity gap.

## 7.3 Service Cost

We do not assume that hosting, email, and web video are free. BE1 decides the service options and usage ceilings in the first two days, and the project owner approves the trial budget. Human development cost is separate from service fees, and there is no approved total cash amount before selecting providers.

Project Plan | v2.0 | 7

---

# 8 Decisions, Risks and Follow-up

| Item | Decision or Action | Deadline |
|---|---|---|
| Product Language and Services | Set the interface, email, and video language and the test environment; the document is Arabic and does not impose the product language. | First two days |
| Refund Policy | Define the window, proht settlement eligibility, and the effect of a refund on access and the negative balance. | Week 1 |
| Published Content Editing | Proposed: the published version remains available while a major edit is under review; confirm the approach before implementation. | Week 1 |
| Backend Bottleneck | One work list; early contract and Mocks; track actual BE1 hours and blockers. | Daily |
| Purchase and Learning Journey Delay | Focus improvements on it; re-estimate the remaining effort with the product representative. | End of Week 4 |
| Commercial Launch | Resolve payment-gateway eligibility and security and operations/policies review; it is not assumed automatically. | Before live operation |

## 8.1 Handling Scope Change

Any new request enters the Backlog with clear value, an estimate, and dependencies. The product representative decides with the team whether it replaces another item or waits for a later release. We do not add it beyond capacity, and we do not remove a core feature merely to preserve the number of weeks.

## 8.2 Three Validation Points

- End of week 2: registration, instructor approval, and course draft saved; core service trials are successful.
- End of week 4: a published course is purchased in test mode, learning opens, and progress is saved safely.
- End of week 6: administration, earnings, and settlements are complete, acceptance tests are successful, and the trial version is delivered.

## 8.3 Plan Decision

We set 6 weeks as a conditional execution target for the new team. The baseline is 20 hours per week per person, and increasing BE1 availability to 35 hours is an option for review, not an assumed schedule. We use incremental delivery, early integration, and testing within each Sprint, and we measure progress with completed features. Approval of the work plan does not equal approval of the commercial launch.

## Scope and Change Reference

Source: the MVP document and the attached E_Learning_Project_Plan.docx file. Version 2.0 keeps the 6-week target and the distribution of 1 backend, 3 frontend, and 1 UI/UX; corrects the contingency calculation and the delivery-date conflict; and adds risk management and follow-up criteria. Last updated: 12 September 2026.

Project Plan | v2.0 | 8
