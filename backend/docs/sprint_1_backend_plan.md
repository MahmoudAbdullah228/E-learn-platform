# Sprint 1 — Backend Execution Plan (BE1)

## E-Learning Marketplace MVP | MERN Stack

> **حالة الوثيقة:** جاهزة للتنفيذ  
> **مدة الـSprint:** أسبوعان  
> **سعة BE1 المتاحة:** 40 ساعة  
> **العمل المخطط:** 32 ساعة  
> **احتياطي للمراجعة والتكامل والعوائق:** 8 ساعات

---

## 1. هدف الـSprint

بنهاية Sprint 1 يجب أن يعمل المسار التالي من البداية للنهاية:

1. مستخدم جديد ينشئ حسابًا ويؤكد بريده ويسجل الدخول.
2. المستخدم يقدم طلبًا للانضمام كمحاضر.
3. Admin يراجع الطلب ويقبله أو يرفضه مع تسجيل السبب.
4. المحاضر المقبول ينشئ كورسًا في حالة `draft`.
5. المحاضر يضيف أقسامًا ودروسًا ويحفظ ترتيبها.
6. الفريق يثبت عمليًا إمكانية إرسال البريد ورفع الفيديو مباشرة إلى مزود خارجي واستقبال Webhook موثّق.

الـSprint يثبت **مسار إنشاء الكورس كمسودة**. مراجعة الكورس ونشره وبيعه ليست جزءًا من Sprint 1.

---

## 2. نطاق العمل

### داخل Sprint 1

- إعداد Express وMongoDB والبنية الأساسية للمشروع.
- التسجيل وتأكيد البريد وتسجيل الدخول وتجديد الجلسة والخروج.
- استعادة كلمة المرور.
- عرض وتعديل البيانات الأساسية للملف الشخصي بدون رفع صورة.
- إنشاء أول Admin بطريقة آمنة من خلال seed script.
- إنشاء تصنيفات أولية من خلال seed script.
- تقديم ومراجعة طلبات المحاضرين.
- إنشاء وتعديل كورس `draft` خاص بالمحاضر.
- CRUD للأقسام والدروس وإعادة ترتيبها.
- تجربة Direct Upload للفيديو وتوثيق قرار مزود الفيديو.
- اختبارات وتوثيق API للوظائف الموجودة في هذا الـSprint.

### خارج Sprint 1

- رفع صورة المستخدم وصورة غلاف الكورس فعليًا؛ نحفظ فقط المفاتيح أو نستخدم placeholder مؤقتًا.
- تقديم الكورس للمراجعة، قبول/رفض الكورس، والنشر.
- الكتالوج العام والبحث والفلترة وصفحة تفاصيل الكورس المنشور.
- Stripe وCheckout وPayments وEnrollments.
- حماية مشاهدة الفيديو وتتبع تقدم الطالب.
- رفع مرفقات PDF وإدارة التخزين النهائي لها.
- الإشعارات والـbackground jobs المتقدمة.

هذه البنود تنتقل إلى Sprint 2 حتى يظل Sprint 1 قابلًا للتسليم في 40 ساعة.

---

## 3. Definition of Done

يُعتبر Sprint 1 منتهيًا فقط عند تحقق الآتي:

- [x] جميع المسارات المذكورة في قسم API Contract تعمل.
- [x] لا يستطيع المستخدم التسجيل مباشرة كـAdmin أو Instructor.
- [x] رحلة `register → verify → login → refresh → logout` مغطاة باختبارات Integration.
- [x] رحلة `apply → admin approve/reject → create draft course` مغطاة باختبارات Integration.
- [x] لا يستطيع محاضر قراءة أو تعديل كورسات محاضر آخر.
- [x] حذف Section يحذف Lessons التابعة له بصورة متسقة.
- [x] إعادة الترتيب لا تسمح بمعرّفات ناقصة أو زائدة أو مكررة.
- [x] البريد يعمل في بيئة التطوير أو الاختبار من خلال مزود محدد.
- [x] تجربة رفع فيديو مباشر تعمل، والـWebhook يتحقق من التوقيع قبل تعديل البيانات.
- [x] الأخطاء ترجع JSON موحدًا ولا تكشف stack trace أو أسرارًا في الإنتاج.
- [x] `.env.example` وREADME وAPI collection/OpenAPI محدثة.
- [x] الاختبارات وlint ينجحان من أمر واحد موثق.

---

## 4. قرارات تقنية ثابتة قبل التنفيذ

| المجال | القرار |
|---|---|
| Runtime | إصدار Node.js LTS مثبت في `package.json`/`.nvmrc` |
| API | Express REST API تحت `/api/v1` |
| Database | MongoDB + Mongoose |
| Validation | Zod فقط لتجنب خلط مكتبتين |
| Password hashing | bcrypt بـcost مناسب، حد أدنى 10 |
| Access token | JWT قصير العمر: 15 دقيقة |
| Refresh token | قيمة عشوائية opaque؛ المخزن في DB هو hash فقط |
| Web client storage | Refresh token في Cookie من نوع `HttpOnly`, `Secure` في الإنتاج و`SameSite=Lax` |
| Tests | Node.js test runner + Supertest + قاعدة اختبار مستقلة؛ موثق في ADR 0003 |
| API docs | OpenAPI أو Postman collection؛ اختيار واحد وتحديثه مع كل Story |
| Uploads | Direct upload من الـFrontend إلى المزود؛ الـAPI لا يمرر ملفات فيديو كبيرة عبر Express |
| Money | integer بوحدة أصغر عملة: `priceMinor >= 0`، والعملة enum |

### سياسة الجلسات

- `POST /auth/refresh` يدور Refresh Token: يبطل القديم ويصدر واحدًا جديدًا.
- إعادة استخدام Refresh Token تم تدويره بالفعل تعتبر إشارة سرقة وتبطل كل الجلسات داخل نفس `familyId`.
- `POST /auth/logout` يبطل الجلسة الحالية فقط، ولا يحتاج Access Token صالحًا.
- `POST /auth/logout-all` يبطل كل جلسات المستخدم ويزيد `tokenVersion`.
- الحساب `suspended` يُرفض في login وrefresh وكل endpoint محمي.
- الـroles الموجودة داخل JWT ليست مصدر الثقة الوحيد؛ العمليات الحساسة تعيد تحميل المستخدم من DB.

---

## 5. المعمارية

```text
React Frontend
      |
      | REST/JSON + HttpOnly refresh cookie
      v
Express API
  ├── Auth / Users
  ├── Instructor Applications
  ├── Draft Courses / Sections / Lessons
  ├── Email adapter
  └── Upload orchestration + verified webhook
      |
      ├── MongoDB
      ├── Email provider
      └── Video provider  <── direct upload from browser
```

### هيكل المجلدات

```text
server/
├── src/
│   ├── config/
│   │   ├── db.js
│   │   ├── env.js
│   │   └── cors.js
│   ├── models/
│   │   ├── User.js
│   │   ├── OneTimeToken.js
│   │   ├── RefreshSession.js
│   │   ├── InstructorApplication.js
│   │   ├── Category.js
│   │   ├── Course.js
│   │   ├── Section.js
│   │   └── Lesson.js
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── instructorApplications/
│   │   ├── courses/
│   │   └── uploads/
│   ├── middlewares/
│   │   ├── authenticate.js
│   │   ├── authorize.js
│   │   ├── validate.js
│   │   ├── rateLimiter.js
│   │   └── errorHandler.js
│   ├── services/
│   │   ├── email.service.js
│   │   └── video.service.js
│   ├── utils/
│   │   ├── ApiError.js
│   │   └── asyncHandler.js
│   └── app.js
├── scripts/
│   ├── seed-admin.js
│   └── seed-categories.js
├── tests/
├── .env.example
├── package.json
├── server.js
└── README.md
```

> التقسيم حسب feature داخل `modules` يقلل تشتت ملفات الـroute/controller/service الخاصة بنفس الوظيفة. يمكن استخدام تقسيم layers التقليدي إذا كان المشروع بدأ به بالفعل، بشرط ثبات النمط وعدم خلط الطريقتين.

---

## 6. نموذج البيانات

### User

```js
{
  _id: ObjectId,
  name: String,                       // required, trimmed
  email: String,                      // required, normalized, unique index
  passwordHash: String,               // select: false
  roles: [String],                    // student | instructor | admin
  status: String,                     // active | suspended
  instructorStatus: String,           // none | pending | approved | rejected
  instructorProfile: {
    bio: String,
    expertise: String
  },
  emailVerifiedAt: Date,
  tokenVersion: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### OneTimeToken

خاص بتأكيد البريد واستعادة كلمة المرور فقط.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  tokenHash: String,                  // unique; never store raw token
  purpose: String,                    // email_verification | password_reset
  expiresAt: Date,                    // TTL index for cleanup
  consumedAt: Date,
  createdAt: Date
}
```

### RefreshSession

```js
{
  _id: ObjectId,
  userId: ObjectId,
  tokenHash: String,                  // unique
  familyId: String,                   // supports rotation/reuse handling
  expiresAt: Date,
  revokedAt: Date,
  replacedBySessionId: ObjectId,
  userAgent: String,
  createdAt: Date
}
```

### InstructorApplication

```js
{
  _id: ObjectId,
  userId: ObjectId,
  bio: String,
  expertise: String,
  status: String,                     // pending | approved | rejected
  reviewedBy: ObjectId,
  rejectionReason: String,
  reviewedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

قيد مهم: يوجد طلب `pending` واحد فقط لكل مستخدم. يجب فرض ذلك في قاعدة البيانات بـpartial unique index، وليس بفحص application code فقط.

### Category

```js
{
  _id: ObjectId,
  name: String,
  slug: String,                       // unique
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Course

```js
{
  _id: ObjectId,
  instructorId: ObjectId,
  categoryId: ObjectId,
  title: String,
  slug: String,                       // unique; generated with collision handling
  description: String,
  coverKey: String,                   // optional in Sprint 1
  requirements: [String],
  learningOutcomes: [String],
  priceMinor: Number,                 // integer >= 0
  currency: String,                   // EGP in MVP
  status: String,                     // draft in Sprint 1
  createdAt: Date,
  updatedAt: Date
}
```

### Section

```js
{
  _id: ObjectId,
  courseId: ObjectId,
  title: String,
  position: Number,
  createdAt: Date,
  updatedAt: Date
}
```

Index: `{ courseId: 1, position: 1 }`.

### Lesson

```js
{
  _id: ObjectId,
  sectionId: ObjectId,
  title: String,
  position: Number,
  videoAssetId: String,
  videoStatus: String,                // none | pending | processing | ready | failed
  durationSeconds: Number,
  isPreview: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

Index: `{ sectionId: 1, position: 1 }`.

---

## 7. API Contract — Sprint 1

كل الاستجابات الناجحة تستخدم الشكل:

```json
{ "data": {}, "message": "optional" }
```

وكل الأخطاء تستخدم الشكل:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable message",
    "details": []
  }
}
```

### Auth

| Method | Endpoint | Auth | الملاحظات |
|---|---|---:|---|
| POST | `/api/v1/auth/register` | لا | ينشئ Student فقط |
| POST | `/api/v1/auth/verify-email` | لا | token لمرة واحدة |
| POST | `/api/v1/auth/resend-verification` | لا | استجابة عامة + rate limit |
| POST | `/api/v1/auth/login` | لا | يعيد access token ويضع refresh cookie |
| POST | `/api/v1/auth/refresh` | Cookie | rotation للـrefresh session |
| POST | `/api/v1/auth/logout` | Cookie | يبطل الجلسة الحالية فقط |
| POST | `/api/v1/auth/logout-all` | نعم | يبطل كل الجلسات |
| POST | `/api/v1/auth/forgot-password` | لا | استجابة عامة لا تكشف وجود البريد |
| POST | `/api/v1/auth/reset-password` | لا | يبطل الجلسات القديمة بعد النجاح |

### User

| Method | Endpoint | Auth | الملاحظات |
|---|---|---:|---|
| GET | `/api/v1/users/me` | نعم | لا يعيد `passwordHash` أو token fields |
| PATCH | `/api/v1/users/me` | نعم | الاسم فقط في Sprint 1 |

### Instructor applications

| Method | Endpoint | Auth/Role | الملاحظات |
|---|---|---|---|
| POST | `/api/v1/instructor-applications` | authenticated student | يمنع وجود طلب pending آخر |
| GET | `/api/v1/instructor-applications/me` | authenticated | آخر طلب وحالته |
| GET | `/api/v1/admin/instructor-applications` | admin | pagination + status filter |
| PATCH | `/api/v1/admin/instructor-applications/:applicationId` | admin | approve/reject فقط من pending |

قبول أو رفض الطلب يعدّل `InstructorApplication` و`User` داخل MongoDB transaction واحدة. الرفض يحتاج `rejectionReason`، والقبول يضيف role `instructor` دون حذف role `student`.

### Draft courses

استخدام namespace منفصل للمحاضر يمنع تعارض `:courseId` مع `:slug` الذي سيضاف للكتالوج العام لاحقًا.

| Method | Endpoint | Auth/Role |
|---|---|---|
| GET | `/api/v1/instructor/courses` | instructor |
| POST | `/api/v1/instructor/courses` | instructor |
| GET | `/api/v1/instructor/courses/:courseId` | owner instructor |
| PATCH | `/api/v1/instructor/courses/:courseId` | owner instructor |

قواعد أساسية:

- كل عمليات Sprint 1 مسموحة للكورس `draft` فقط.
- كل endpoint يحمل `courseId`, `sectionId`, أو `lessonId` يتحقق من الملكية server-side.
- `categoryId` يجب أن يشير إلى Category فعالة.
- الـslug يعالج التصادم بإضافة suffix ولا يعتمد على العنوان وحده.

### Sections and lessons

| Method | Endpoint | Auth/Role |
|---|---|---|
| POST | `/api/v1/instructor/courses/:courseId/sections` | owner |
| PATCH | `/api/v1/instructor/courses/:courseId/sections/:sectionId` | owner |
| DELETE | `/api/v1/instructor/courses/:courseId/sections/:sectionId` | owner |
| PUT | `/api/v1/instructor/courses/:courseId/sections/order` | owner |
| POST | `/api/v1/instructor/sections/:sectionId/lessons` | owner |
| PATCH | `/api/v1/instructor/lessons/:lessonId` | owner |
| DELETE | `/api/v1/instructor/lessons/:lessonId` | owner |
| PUT | `/api/v1/instructor/sections/:sectionId/lessons/order` | owner |

طلب إعادة الترتيب:

```json
{ "orderedIds": ["id1", "id2", "id3"] }
```

يجب أن تكون القائمة هي نفس مجموعة العناصر الحالية تمامًا، بدون نقص أو زيادة أو تكرار. يتم التحديث داخل transaction أو `bulkWrite` مع معالجة فشل العملية. حذف Section يحذف Lessons التابعة لها داخل transaction.

### Video proof of concept

| Method | Endpoint | Auth/Role | الملاحظات |
|---|---|---|---|
| POST | `/api/v1/instructor/lessons/:lessonId/video-upload` | owner | ينشئ direct-upload URL |
| POST | `/api/v1/webhooks/video` | signature | raw body عند احتياج المزود لذلك |

لا يستقبل Express ملف الفيديو نفسه. الـFrontend يرفع للمزود مباشرة، ثم يرسل المزود Webhook لتحديث `videoAssetId`, `videoStatus`, و`durationSeconds`. يجب أن تكون معالجة الـWebhook idempotent لأن المزود قد يعيد الحدث أكثر من مرة.

---

## 8. خطة التنفيذ والتقدير

الاختبارات والتوثيق جزء من تقدير كل Story وليسا مهمة مؤجلة لنهاية الـSprint.

### الأسبوع الأول — 18 ساعة مخططة

#### Story 1.1 — Foundation وDeveloper Experience — 5 ساعات

- إنشاء المشروع وتثبيت الإصدارات والأوامر: 1 ساعة.
- إعداد env validation وMongoDB connection وgraceful shutdown: 1 ساعة.
- CORS وHelmet وlogging وcompression: 0.5 ساعة.
- error format و404 handler وasync handling: 1 ساعة.
- إعداد Jest/Supertest وقاعدة الاختبار وlint: 1 ساعة.
- seed scripts للـAdmin والتصنيفات: 0.5 ساعة.

**Acceptance Criteria**

- `npm run dev` يشغل السيرفر ويتصل بقاعدة البيانات.
- `npm test` و`npm run lint` يعملان محليًا.
- startup يفشل برسالة واضحة عند نقص env مطلوب.
- يوجد health endpoint لا يكشف أسرارًا.
- تشغيل seed أكثر من مرة لا ينشئ نسخًا مكررة.

#### Story 1.2 — Registration وEmail Verification — 4 ساعات

- register + hashing + duplicate handling.
- إنشاء one-time token آمن وتخزين hash فقط.
- email adapter ورسالة التحقق.
- verify وresend مع rate limiting.
- اختبارات success, duplicate, expired, consumed token.

**Acceptance Criteria**

- التسجيل ينشئ role `student` فقط.
- token صالح 24 ساعة ولمرة واحدة.
- resend وregister لا يكشفان معلومات غير لازمة عن الحسابات.
- أخطاء unique index تتحول إلى `409 Conflict` منظم.

#### Story 1.3 — Login وSession Management — 4 ساعات

- login وaccess token وrefresh cookie.
- refresh rotation.
- logout الحالي وlogout-all.
- authenticate/authorize middleware.
- اختبارات expired/revoked/suspended/wrong-role.

**Acceptance Criteria**

- Access Token ينتهي بعد 15 دقيقة.
- لا يتم تخزين raw refresh token في DB.
- logout الحالي لا يخرج باقي الأجهزة.
- logout-all يبطل كل الجلسات.
- suspend يمنع login وrefresh والعمليات المحمية.

#### Story 1.4 — Password Reset — 3 ساعات

- forgot-password باستجابة عامة.
- reset-password بـone-time token.
- إبطال الجلسات بعد تغيير كلمة المرور.
- اختبارات المسار الكامل والحالات السلبية.

#### Story 1.5 — Basic Profile — ساعتان

- `GET /users/me`.
- `PATCH /users/me` للاسم فقط.
- validation وauthorization tests.

### الأسبوع الثاني — 14 ساعة مخططة

#### Story 2.1 — Instructor Applications — 3 ساعات

- تقديم الطلب وعرض حالته.
- قائمة Admin مع pagination/filter.
- قبول/رفض داخل transaction.
- اختبارات transitions والـauthorization.

**Allowed transitions**

```text
none/rejected → pending → approved
                       └→ rejected
```

لا يمكن تعديل طلب تمت مراجعته. إعادة التقديم بعد الرفض تنشئ طلبًا جديدًا وتُحسم سياسة مدة الانتظار Product-wise قبل Sprint 2.

#### Story 2.2 — Draft Course — 3.5 ساعات

- إنشاء وعرض وتعديل قائمة كورسات المحاضر.
- owner checks.
- category validation وslug collision handling.
- اختبارات access isolation والـvalidation.

#### Story 2.3 — Sections and Lessons — 4.5 ساعات

- CRUD للأقسام والدروس.
- append position عند الإنشاء.
- reorder validation والتحديث الذري.
- cascade delete بصورة متسقة.
- اختبارات الملكية والترتيب والحذف.

#### Story 2.4 — Email/Video Integration Spike — 3 ساعات

- إثبات إرسال البريد على بيئة التطوير: 0.5 ساعة.
- اختيار مزود الفيديو وتسجيل سبب القرار: 0.5 ساعة.
- إنشاء direct upload وتجربة ملف صغير: 1 ساعة.
- webhook signature + idempotency + تحديث lesson: 1 ساعة.

**مخرج الـSpike**

- ملف قرار قصير يحدد المزود، التكلفة/الحدود، env المطلوبة، upload flow، webhook events، والـfallback.
- اختبار تكامل واحد على الأقل أو fixture موثق للـWebhook.

### الاحتياطي — 8 ساعات

لا تُملأ بميزات جديدة عند بداية الـSprint. تستخدم بالترتيب التالي:

1. إصلاح عوائق التكامل والبنية الأساسية.
2. مراجعة الكود ومعالجة ملاحظاتها.
3. تحسين الاختبارات والتوثيق.
4. دعم تكامل الـFrontend مع الـAPI.

إذا بقي وقت بعد اكتمال Definition of Done يمكن سحب أول Story جاهزة من Sprint 2 باتفاق الفريق.

### ملخص الساعات

| حزمة العمل | الساعات |
|---|---:|
| Foundation | 5 |
| Registration + Verification | 4 |
| Login + Sessions | 4 |
| Password Reset | 3 |
| Basic Profile | 2 |
| Instructor Applications | 3 |
| Draft Course | 3.5 |
| Sections + Lessons | 4.5 |
| Email/Video Spike | 3 |
| **إجمالي العمل المخطط** | **32** |
| **احتياطي** | **8** |
| **السعة الكلية** | **40** |

---

## 9. ترتيب التنفيذ والاعتماديات

```text
Foundation
   ├── Auth + Sessions ── Password Reset ── Profile
   ├── Admin/Category Seeds
   └── Email Adapter
             |
Instructor Application + Admin Review
             |
Draft Course
             |
Sections + Lessons
             |
Direct Video Upload Spike
```

- لا يبدأ Course API قبل اكتمال authorization والـAdmin/Category seeds.
- لا يبدأ Video Spike النهائي قبل وجود Lesson وownership checks.
- يمكن تنفيذ email adapter بالتوازي منطقيًا مع auth، لكن دمجه واختباره جزء من Story 1.2.

---

## 10. قواعد الأمان وجودة البيانات

- توحيد البريد إلى lowercase/normalized form قبل الحفظ والاستعلام.
- عدم تسجيل passwords أو tokens أو cookies أو authorization headers في logs.
- تحديد max body size للـJSON وعدم قبول فيديو داخل Express.
- Rate limits منفصلة لـregister/login/resend/forgot-password.
- مقارنة passwords وtoken hashes بطريقة آمنة.
- التحقق من CORS origins و`credentials` حسب بيئة الـFrontend.
- حماية endpoints المعتمدة على Cookie بفحص `Origin`/`Referer` المسموح، وإضافة CSRF token إذا فرض شكل الـdeployment استخدام `SameSite=None`.
- فهرس TTL للتنظيف وليس كبديل عن فحص `expiresAt` وقت الطلب.
- كل ObjectId يتم التحقق من صيغته قبل الاستعلام.
- `401` لغياب/فشل المصادقة، و`403` لفشل الصلاحية، و`404` للموارد غير المتاحة للمستخدم عندما يمنع ذلك كشف الملكية.
- استخدام transactions يتطلب MongoDB replica set؛ Atlas يدعمه، وبيئة الاختبار يجب أن تحاكيه أو تختبر fallback واضحًا.
- Webhooks تتحقق من signature باستخدام raw request body وفق توثيق المزود.
- لا تُرجع API حقولًا داخلية مثل `passwordHash`, `tokenHash`, أو stack traces.

---

## 11. استراتيجية الاختبار

### Unit tests

- validators والـstatus transitions.
- token hashing/generation helpers.
- ownership/role policies.
- slug collision logic.
- reorder input validation.

### Integration tests

- `register → verify → login → refresh → logout`.
- forgot/reset password ثم فشل الجلسات القديمة.
- user suspended بين login وrefresh.
- apply ثم approve/reject مع منع transition غير صالح.
- instructor ينشئ draft ويضيف sections/lessons ويعيد ترتيبها.
- instructor آخر يحصل على رفض دون كشف بيانات الكورس.
- حذف section يحذف lessons التابعة.
- webhook صحيح يحدث الفيديو، وتوقيع خاطئ يُرفض، وإعادة نفس الحدث لا تكرر الأثر.

### بيانات الاختبار

- قاعدة بيانات مستقلة كليًا عن development.
- factories للمستخدمين والأدوار والكورسات بدل fixtures مترابطة يدويًا.
- mock للبريد في الاختبارات الآلية، مع smoke test منفصل للمزود الحقيقي.

---

## 12. مخاطر الـSprint وخطة التعامل

| الخطر | الاحتمال | الأثر | الإجراء |
|---|---|---|---|
| تعقيد video provider/webhook | متوسط | عالٍ | Direct-upload spike محدود بـ3 ساعات؛ لا نبني streaming كاملًا |
| مشاكل Cookies/CORS بين frontend وAPI | متوسط | عالٍ | تجربة login/refresh من origin الحقيقي مبكرًا |
| transactions في بيئة الاختبار | متوسط | متوسط | تجهيز replica-set test DB في Story 1.1 |
| تضخم Scope أثناء التنفيذ | عالٍ | عالٍ | لا نسحب Sprint 2 قبل اكتمال DoD |
| تأخر credentials للبريد أو الفيديو | متوسط | متوسط | تحديد المسؤول والموعد في أول يوم؛ استخدام adapter/mock مؤقتًا |
| تعارض API Contract مع الـFrontend | متوسط | عالٍ | مراجعة العقد مع فريق FE بعد Foundation مباشرة |

---

## 13. نقاط مراجعة الفريق

### نهاية اليوم الأول

- المشروع يعمل والـenv وقاعدة الاختبار جاهزان.
- أسماء الـendpoints وشكل success/error responses متفق عليها مع الـFrontend.
- يوجد قرار مبدئي لمزود البريد والفيديو وأصحاب الـcredentials.

### نهاية الأسبوع الأول

- رحلة Auth كاملة تعمل باختبارات.
- seed Admin/Category يعمل.
- مراجعة الساعات الفعلية مقابل 18 ساعة مخططة.
- إذا استُهلك أكثر من نصف الاحتياطي، يتم تقليل Video Spike إلى proof موثق بدون تحسينات إضافية.

### قبل إغلاق الـSprint

- Demo للمسار الكامل المحدد في Sprint Goal.
- تشغيل test/lint من بيئة نظيفة.
- تحديث README وAPI contract والقرارات التقنية.
- تسجيل البنود غير المكتملة بوضوح في Sprint 2 دون اعتبارها Done جزئيًا.

---

## 14. Sprint 2 Backlog Preview

الترتيب المقترح بعد إغلاق Sprint 1:

1. رفع avatar وcourse cover والمرفقات مع سياسات الحجم والنوع والحذف.
2. شروط جاهزية الكورس ثم `submit_for_review`.
3. Admin course review ثم publish/reject.
4. Public catalog وcourse details بدون كشف video URLs الخاصة.
5. Stripe Checkout + verified webhook + idempotent enrollment.
6. Free/paid enrollment وحماية الوصول.
7. Lesson progress وتتبع الإكمال.

لا يتم عرض كورس للعامة في Sprint 1؛ لذلك لا يوجد تعارض بين الـDefinition of Done وبين غياب عملية النشر.
