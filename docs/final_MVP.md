# Minimum Viable Product Scope Document for the E-Learning Platform

**E-Learning Course Marketplace Platform using the MERN Stack**

| Item | Decision |
| --- | --- |
| Product Type | E-Learning Marketplace |
| Primary Market | Egypt |
| Revenue Model | 20% platform commission on each purchase |
| Sales Model | Separate payment for each course |
| Development Gateway | Stripe Test Mode |
| Release | MVP Version 1.0 |
| Date | September 12, 2026 |

This document is the team's single reference for design, development, and testing. It defines what is included in the first version and what is deferred to later releases.

MVP Scope | Version 1.0 | 1

---

## 1 Executive Summary

The product is an educational Marketplace platform that connects students with instructors. The first version focuses on completing a stable end-to-end commercial and learning flow: an instructor applies to join, is approved by the admin, creates a course, the admin reviews and publishes it, the student purchases it and starts learning, and the instructor's share and the platform commission are recorded.

**Scope Decision:** MVP quality is not measured by the number of features, but by whether a real user can complete the entire flow above from start to finish without technical intervention or workarounds.

## 2 Objectives of the First Version

- Validate real demand for purchasing courses through the platform.
- Enable approved instructors to create structured content without developer intervention.
- Enable students to purchase, learn, and complete lessons with progress tracking.
- Enable the admin to control quality and content and manage users, requests, and earnings.
- Establish an architecture that allows changing the payment gateway or adding features later without rebuilding the system.

## 3 Approved Working Assumptions

| Topic | Approved Decision |
| --- | --- |
| Audience | Students in Egypt, with the ability to expand later |
| Roles | Student, Instructor, Admin |
| Currency | Egyptian pound in the product UI and database |
| Access | Continuous access to the course while both the course and account remain available |
| Settlements | Instructor earnings settled manually once per month |
| Content | Video with description and optional PDF attachment |
| Platforms | Responsive web on desktop and mobile |

MVP Scope | Version 1.0 | 2

---

## 4 Roles and Permissions

| Role | Permission Scope |
| --- | --- |
| Student | Register, browse courses, purchase and learn, track progress, and manage the account |
| Instructor | Manage instructor profile, create courses and content, and track only their own sales and earnings |
| Admin | Approve instructors, review courses, and manage categories, users, requests, and settlements |

### 4.1 Permission Rules

- Public sign-up creates a Student account only.
- Switching to Instructor is done through a separate application and Admin approval.
- An Instructor cannot view or modify another instructor's courses, sales, or earnings.
- A Student cannot access paid course content before a valid Enrollment exists.
- No course or lesson appears in the public catalog unless its status is Published.
- Account suspension blocks login or new actions without deleting historical records.
- Every permission check is enforced on the server even if the corresponding button or page is hidden in the UI.

## 5 Main User Journey

| Stage | Name | Outcome |
| --- | --- | --- |
| 1 | Join | The user registers as a student, then submits an instructor application if desired. |
| 2 | Approval | The admin reviews instructor details and accepts or rejects the application. |
| 3 | Course Creation | The instructor creates a draft and adds sections, lessons, and the price. |
| 4 | Review | The admin accepts the course for publication or rejects it with a reason. |
| 5 | Purchase | The student pays and the platform confirms the transaction through a trusted Webhook. |
| 6 | Learning | The course appears in My Courses and the system saves the student's progress. |
| 7 | Settlement | Instructor earnings are recorded and the admin transfers them manually on the settlement date. |

MVP Scope | Version 1.0 | 3

---

## 6 Student Scope

| ID | Requirement |
| --- | --- |
| STU 01 | Create an account and log in / log out. |
| STU 02 | Verify email, recover the password, and set a new password. |
| STU 03 | Edit name, profile image, and basic profile information. |
| STU 04 | Browse published courses and search by course name. |
| STU 05 | Filter by category and by free or paid. |
| STU 06 | Open the course details page and view curriculum, instructor, and price. |
| STU 07 | Open a lesson Preview, if available, without purchasing. |
| STU 08 | Start Checkout for one course and receive the payment result. |
| STU 09 | View purchased courses in My Courses. |
| STU 10 | Play lessons, navigate between them, and download allowed attachments. |
| STU 11 | Mark a lesson complete and save the last lesson and progress percentage. |
| STU 12 | View order history and the status of each order. |

### 6.1 Course Details Page

- Course title and image, short and detailed descriptions.
- Instructor name and brief bio.
- Price, what the student will learn, and prerequisites.
- Number of sections and lessons and the estimated duration.
- Content list with an indicator for preview / free lessons.
- A Purchase button, or Start Learning if the student is already enrolled.

MVP Scope | Version 1.0 | 4

---

## 7 Instructor Scope

| ID | Requirement |
| --- | --- |
| INS 01 | Submit an instructor application including a bio, specialization, and optional profile links. |
| INS 02 | View application status and the reason for rejection, if any. |
| INS 03 | Create a Draft course and edit its basic information. |
| INS 04 | Add Sections and Lessons, reorder them, and delete them before publishing. |
| INS 05 | Upload lesson video and add a description and an optional PDF attachment. |
| INS 06 | Mark one or more lessons as a free preview. |
| INS 07 | Submit the course for review and view the admin's decision and reason. |
| INS 08 | View only the instructor's own courses according to status. |
| INS 09 | View number of sales, total earnings, pending amount, and paid amount. |
| INS 10 | View monthly settlement history. |

### 7.1 Course Data

| Group | Fields |
| --- | --- |
| Basic | Title, short description, full description, image, and category |
| Commercial | Price, free status, and commission recorded at the time of sale |
| Educational | Objectives, requirements, level, language, and estimated duration |
| Content | Sections, lessons, video, description, attachments, and display order |
| Governance | Owner, status, rejection reason, and submission / review / publish dates |

**Post-publish edit rule:** Simple text corrections are allowed, while any material change to price, content, or image sends the course back to Pending Review before the edited version appears.

MVP Scope | Version 1.0 | 5

---

## 8 Admin Scope

| ID | Requirement |
| --- | --- |
| ADM 01 | View users, search them, and identify their role and status. |
| ADM 02 | Approve or reject an instructor application, with a written rejection reason. |
| ADM 03 | Suspend or reactivate an account without deleting its history. |
| ADM 04 | Create, edit, or archive categories. |
| ADM 05 | Review a course and accept or reject it with clear notes. |
| ADM 06 | Archive a published course while previous purchasers retain access according to policy. |
| ADM 07 | View orders, payment statuses, and the transaction identifier at the payment gateway. |
| ADM 08 | View the platform commission and each instructor's earnings. |
| ADM 09 | Create a manual settlement and mark the internal transactions included in it as Paid. |
| ADM 10 | View concise metrics for students, instructors, courses, and sales. |

### 8.1 Dashboard Metrics

| Area | Metrics |
| --- | --- |
| Users | Number of students, active instructors, and pending applications |
| Content | Number of drafts, courses under review, and published courses |
| Sales | Number of paid orders and total sales value |
| Earnings | Platform commission and pending / paid instructor earnings |

MVP Scope | Version 1.0 | 6

---

## 9 Payments, Orders, and Commissions

The MVP uses a Pay Per Course model. The server creates a payment session, then waits for a trusted Webhook from the payment gateway before considering the order paid and creating the Enrollment. The platform does not rely on the payment-success page alone because it can be closed or manipulated.

### 9.1 Revenue Distribution Formula

| Item | Calculation |
| --- | --- |
| Original Price | 1000 EGP |
| Discount | 0 EGP in the MVP unless added administratively later |
| Paid Amount | 1000 EGP |
| Platform Commission | 20% = 200 EGP |
| Instructor Entitlement | 80% = 800 EGP |
| Payment Gateway Fees | Absorbed by the platform in the first version |

### 9.2 Accounting Rules

- Commission is calculated on the actual paidAmount after any discount.
- commissionRate, platformCommission, and instructorEarning are stored in the purchase history at payment time.
- Previous sales calculations do not change if the commission is changed later.
- No Enrollment or Earning is created except through a successful, verified Webhook.
- Every payment-gateway event must include an idempotent webhook ID so a repeated event does not duplicate the earning.
- If the amount is refunded before settlement, the earning is cancelled. After settlement, it is recorded as a negative value in the next settlement.

### 9.3 Manual Settlements

1. The admin gathers all unsettled Eligible earnings for each instructor.
2. A Payout is created with the total amount and the transactions included in it.
3. The amount is transferred to the instructor outside the system using the approved method.
4. The transfer reference is recorded and the settlement status is changed to Paid.

MVP Scope | Version 1.0 | 7

---

## 10 System Statuses

| Entity | Allowed Statuses |
| --- | --- |
| Instructor | Pending -> Approved or Rejected -> Suspended when needed |
| Course | Draft -> Pending Review -> Published or Rejected -> Archived |
| Order | Pending -> Paid or Failed or Cancelled or Refunded |
| Payment | Created -> Processing -> Succeeded or Failed or Refunded |
| Earning | Pending -> Eligible -> Included in Payout or Reversed |
| Payout | Draft -> Pending -> Paid or Cancelled |

## 11 Business Rules

| ID | Rule |
| --- | --- |
| BR 01 | A course cannot be published without at least a title, description, image, category, price, one section, and one lesson. |
| BR 02 | An instructor cannot submit a course for review unless all required fields are complete. |
| BR 03 | The same course cannot be purchased twice by the same account unless the previous transaction is Failed or fully Refunded. |
| BR 04 | A free course creates an Enrollment directly without a paid Order. |
| BR 05 | Progress equals the number of completed lessons divided by the total number of published lessons. |
| BR 06 | Adding a new lesson may reduce current students' progress percentage; the newly calculated percentage must be shown. |
| BR 07 | Deleting a course that has buyers is prohibited; archiving is used instead. |
| BR 08 | Deleting an instructor who has sales is prohibited; suspension is used instead. |
| BR 09 | A buyer keeps access to an archived course unless the content is blocked for legal or security reasons. |
| BR 10 | Every instructor or course rejection decision must include a reason visible to the request owner. |

MVP Scope | Version 1.0 | 8

---

## 12 Core Data Model

| Entity | Responsibility |
| --- | --- |
| User | Account, role, status, and primary login data |
| InstructorProfile | Instructor bio, specialization, and approval status |
| Category | Course classification and category status |
| Course | Course data, owner, price, and status |
| Section | An ordered group of lessons within the course |
| Lesson | Video, description, attachment, order, and preview status |
| Enrollment | Links the student to the course and stores access date and last lesson |
| LessonProgress | Completion status for each lesson and completion date |
| Order | Summary of the purchase, amount, and status |
| OrderItem | Immutable snapshot of course price, commission, and entitlement at purchase time |
| Payment | Payment-gateway reference, status, and Webhook ID |
| Earning | Instructor earning resulting from a specific sale |
| Payout | Instructor settlement, period, value, and transfer status |

### 12.1 Data Integrity Decisions

- Use clear references between entities, with indexes for frequently queried fields.
- Store price and commission snapshots inside OrderItem and do not rely on the course's current price.
- Use Soft Delete or Status for entities that have financial or educational history.
- Store monetary amounts as integers representing the smallest currency unit to avoid decimal issues.
- Record sensitive events such as review decisions, status changes, and Webhook results.

MVP Scope | Version 1.0 | 9

---

## 13 Non-Functional Requirements

| Area | Minimum Requirement |
| --- | --- |
| Security | Strong password hashing, secure JWT, Role Authorization, Validation, and Rate Limiting |
| Payments | Verify the Webhook signature and do not store card data inside the system |
| Privacy | Expose the minimum user data needed for each role |
| Performance | Pagination for lists, lazy-load images, and do not proxy video files through the Node server |
| Media | Upload directly to a dedicated video/storage service with suitable access URLs |
| Reliability | Error Logging and periodic database backups |
| Compatibility | Responsive and supports current Chrome, Edge, Firefox, and Safari |
| Usability | Clear Loading, Empty, and Error states, with understandable error messages |
| Quality | Critical unit tests and integration tests for authentication, payments, and permissions |
| Environments | Separate Development, Staging, and Production; do not commit secrets to Git |

## 14 Technical Decisions for the MVP

| Component | Decision |
| --- | --- |
| Frontend | React with Routing, server-state management, and Responsive interfaces |
| Backend | Node.js and Express with a documented REST API |
| Database | MongoDB with Mongoose and suitable indexes |
| Authentication | Short-lived Access Token with secure Refresh Token, or a Session equivalent by team decision |
| API Contract | One OpenAPI or Postman contract before connecting interfaces |
| Video Storage | An external service; video is not stored in MongoDB or in the Git repository |
| Payment Adapter | An independent layer that prevents order logic from being directly tied to a single provider |

MVP Scope | Version 1.0 | 10

---

## 15 Product Acceptance Criteria

- A new user can create an account, confirm it, log in, and recover the password.
- A student can submit an instructor application, and the admin can accept or reject it with a clear reason.
- An approved instructor can create a complete course and submit it for review.
- The course does not appear publicly before admin approval and publication.
- A student can purchase a published course for the agreed price and complete payment successfully.
- An Enrollment is not created unless payment is confirmed by a successful Webhook.
- A repeated Webhook does not create an additional Enrollment or Earning.
- The paid course appears in My Courses, lessons play, and progress is saved.
- A non-paying user is blocked at the server level from accessing protected video or attachments.
- Instructor earnings appear only in the instructor's own account, and the platform commission equals 20% of the paid amount.
- The admin can create a settlement and record it as paid without duplicating earnings.
- All core flows work on phone and desktop without clipping or overlap.
- Error, loading, and empty states are shown clearly to the user.
- No secrets or payment credentials are present in the browser client.

## 16 Definition of Done

| Dimension | Completion Condition |
| --- | --- |
| Requirements | Linked to a user story and a clear acceptance criterion |
| Design | Matches the approved UI/UX design and is responsive |
| Implementation | Code Review completed and no critical errors remain |
| Testing | Happy-path, error, and permission tests pass |
| Documentation | Endpoint added to the API Contract and environment variables documented |
| Deployment | Runs on Staging and the team can test using accounts for all three roles |

MVP Scope | Version 1.0 | 11

---

## 17 Out of Scope for the First Version

| Group | Deferred Features |
| --- | --- |
| Commerce | Monthly subscriptions, coupons, Bundles, Affiliates, multi-currency, and automatic instructor transfers |
| Learning | Certificates, advanced quizzes, assignments, auto-grading, and live classes |
| Communication | Live Chat, forums, and instant notifications |
| Discovery | Smart recommendations, Wishlist, reviews, and ratings |
| Administration | Advanced accounting reports, a tax system, and automated invoices |
| Platforms | Native Android and iOS apps, and multilingual support |

## 18 Constraints and Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stripe in Egypt | A commercial Stripe account cannot be relied on locally under current availability. | Use Test Mode for development and select a supported legal entity or payment gateway before production. |
| Video | Storage, bandwidth, and protection costs may rise quickly. | Test a provider, usage caps, and the upload/streaming experience early. |
| Refunds | A refund after instructor settlement creates a negative balance. | Record a reversal and deduct it from the next settlement. |
| Content Changes | Adding lessons changes student progress percentages. | Use dynamic calculation and display the new percentage. |
| Permissions | Hiding UI buttons alone does not protect data. | Check ownership and role in every sensitive API. |

Production Gateway: The payment layer must remain decoupled from the platform and confirmed against Stripe requirements so it can be replaced with an Egyptian provider without rebuilding the order, enrollment, and earnings flow.

MVP Scope | Version 1.0 | 12

---

## 19 Field Responsibility Distribution

| Role | Core Responsibility |
| --- | --- |
| **Backend 1** | Authentication, users, roles, instructor applications, admin management, courses, media, orders, payments, Webhooks, earnings, and settlements. |
| **Frontend 1** | Public pages, student journey, purchase flow, and learning experience. |
| **Frontend 2** | Instructor journey, instructor dashboard, and course management. |
| **Frontend 3** | Admin interface, user management, content moderation, and reports. |
| **UI / UX** | Research, role flows, design system, initial wireframes, error states, and responsive behavior. |

## 20 Launch Readiness Checklist

- Approve the user journey and final design for the core screens.
- Document all APIs and link them to the acceptance criteria.
- Test the three user roles using separate accounts (student, instructor, admin).
- Test payment success, failure, cancellation, repeated Webhooks, and refunds.
- Test video upload and playback on an average connection and on mobile.
- Test backups and database restore.
- Set up logging and system monitoring, and run a real test on Staging.
- Add privacy-policy, terms, and refund-policy pages before commercial launch.
- Finalize the payment gateway or legal entity suitable for production in Egypt.
- Run a full team acceptance test for the instructor, student, and admin journeys.

## 21 Final Scope Decision

The MVP is ready when an approved instructor can create a course and publish it after review, a student can purchase it and learn with progress tracking, the platform can record a 20% commission and the instructor's 80% share, and the admin can settle earnings manually with a documented status for every order, payment transaction, settlement, and valid account data.

Any feature that does not directly serve this flow remains outside the first version until actual usage proves the need for it.

MVP Scope | Version 1.0 | 13
