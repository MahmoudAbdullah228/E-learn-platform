# Sprint 2 — Backend Execution Plan

> الحالة: خطة تنفيذ؛ لا تمثل ميزات منفّذة أو تسليمًا مكتملًا.
> المالك: BE1. التنفيذ Story by Story مع مراجعة وتكامل واختبارات لكل Story.
> النطاق كامل، والمدة تقديرية؛ أسبوعان هدف الخطة العامة وليس التزامًا محسومًا بالسعة.
> آخر تحديث: 2026-09-29.

## 1. المراجع والقرارات المعتمدة

- [MVP](../../docs/final_MVP.md): نطاق المنتج وقواعد العمل.
- [Project Plan](../../docs/Project_Plan.md): توزيع العمل بين Sprint 1 و2 و3.
- [Sprint 1 backend plan](./sprint_1_backend_plan.md) والكود الحالي: خط الأساس المنفّذ.
- الرسمتان المرفقتان من المستخدم: `WhatsApp Image 2026-09-12 at 7.52.21 AM (3).jpeg` و`(2).jpeg`، كمرجع لتصميم البيانات. أسماء الملفات للتعريف؛ الصور ليست مرفقة داخل المستودع.

اعتمد المستخدم **الرسم مع تحسينات موثقة**. لذلك snapshot البيع داخل `Order` لكورس واحد، ولا نضيف `OrderItem` منفصلًا. هذا اختلاف مقصود عن قسم 12 في الـMVP، مع الحفاظ على ثبات السعر والعمولة ومراجع البيع.

اعتمد المستخدم Cloudinary للصور وPDF، وMux للفيديو، وخطة مخصصة للباك إند مع تسليم عقود للفرونت. Stripe Test Mode هو قرار الـMVP للدفع.

الترقيم `S2-01` وما بعده خاص بـSprint 2؛ Stories القديمة `2.1–2.4` كانت للأسبوع الثاني من Sprint 1 ولا يعاد تنفيذها.

## 2. الهدف وحدود التسليم

رحلة القبول: محاضر مقبول يجهز كورسًا وفيديو وصورة ومرفقًا، يقدمه للمراجعة، الأدمن ينشره، الطالب يجده ويشتريه في Test Mode، webhook يؤكد البيع مرة واحدة، ثم يظهر في مكتبته ويشاهد ويحفظ تقدمه. الكورس المجاني يدعم التحاقًا مباشرًا بلا دفع.

### الموجود من Sprint 1

Auth والجلسات واستعادة كلمة المرور، الملف الأساسي، طلبات المحاضرين ومراجعتها، التصنيفات الأولية، مسودات الكورسات، الأقسام والدروس وترتيبها، Mux direct uploads وwebhooks وتنظيف الفيديو، MongoDB transactions، OpenAPI واختبارات التكامل.

الفيديوهات الحالية تنشأ دون public playback policy؛ يلزم إضافة signed playback. الكورس ينقصه بعض بيانات العرض والمراجعة، والدرس ينقصه الوصف والمرفقات. ملف المحاضر موجود بالفعل كـembedded object داخل `User`.

### داخل Sprint 2

استكمال المحتوى والصور وPDF، إدارة التصنيفات، المراجعة والنشر، الكتالوج والبحث والتفاصيل، Checkout وwebhooks، snapshots والعمولة، الالتحاق والمكتبة والطلبات، حماية الوصول والتقدم، توثيق التشغيل وتجربة Staging.

### مؤجل إلى Sprint 3 أو خارج الـMVP

- Sprint 3: أهلية الأرباح والتسويات والاسترداد وعكس المستحق، لوحات الأرباح والإحصاءات، إدارة تعليق المستخدمين، الأرشفة التشغيلية، وتعديل النسخ المنشورة.
- Sprint 2 يمنع تعديل المحتوى المنشور؛ لا يطبق تعديلًا ماديًا يغير ما اشتراه الطالب بلا مراجعة. تصميم النسخة المنشورة/نسخة التعديلات جزء من Sprint 3.
- لا Checkout مباشر بأموال حقيقية، ولا اشتراكات أو coupons أو سلة متعددة الكورسات أو DRM أو شهادات أو محادثات.
- مخططات `Refund` و`Payout` موثقة هنا للاستمرارية فقط؛ لا تُنشأ لها endpoints أو jobs تنفيذية في هذا الـSprint.

## 3. أسلوب التنفيذ والمعمارية

- Node.js ESM وExpress تحت `/api/v1`، MongoDB replica set + Mongoose، Zod للتحقق من المدخلات، Node test runner + Supertest.
- البنية الحالية: `config`, `models`, `middlewares`, `services`, `utils`, `modules`؛ لا إعادة هيكلة شاملة ولا repository wrappers لا تضيف قيمة.
- Controllers مسؤولة عن HTTP، services عن قواعد العمل، adapters مستقلة لـCloudinary وMux وStripe. تمرير adapters والوقت للاختبارات وفق النمط الحالي.
- الاستجابات: `{ data, message? }` و`{ error: { code, message, details: [] } }`، مع DTOs لا تكشف أسرارًا أو مراجع وسائط خاصة.
- كل Story تبدأ بتحديث العقد المقترح ثم التنفيذ والاختبارات. لا تُضاف عملية غير منفّذة إلى Swagger المنشور باعتبارها متاحة.
- عمليات DB الذرية داخل transactions؛ طلبات الشبكة للمزودين خارج transaction، مع reservation/idempotency/outbox حيث يلزم.
- تسجيل أخطاء آمن وcorrelation IDs، دون tokens أو signed URLs أو أجسام webhooks أو بيانات بطاقات في logs.
- Owner لكل Story هو BE1. يراجع FE3 عقد API واختبارات الاستخدام؛ مراجعة أمن الدفع تحتاج مراجعًا مؤهلًا وتُسجل كشرط قبل الإنتاج التجاري إن لم يتوفر.

## 4. Data Schema — الرسم المعتمد والتحسينات

### 4.1 قواعد مشتركة

- `_id: ObjectId` و`createdAt/updatedAt` للكيانات الجديدة. FK في الرسم يعني reference منطقيًا؛ MongoDB لا يفرض وجود السجل المرجعي، والخدمات مسؤولة عن التحقق.
- الأموال بوحدة القرش، أعداد صحيحة آمنة غير سالبة باستثناء قيود العكس المالية المستقبلية. العملة `EGP`، وStripe يتلقى `egp` عبر adapter.
- `commissionBps=2000`؛ الحساب بعمليات integer آمنة، باستخدام BigInt وسيطًا قبل التحويل الآمن إلى Number: `platformAmountMinor=floor(amountMinor*2000/10000)`، و`instructorAmountMinor=amountMinor-platformAmountMinor`.
- IDs والعلاقات الحساسة وحالات الإدارة لا تأتي من body دون authorization. فهارس unique هي الضمان النهائي تحت التزامن.
- لا TTL على الطلبات والمدفوعات والأرباح أو بيانات الدراسة. expiry لحالة العمل لا يعني حذف التاريخ.

### 4.2 الكيانات الموجودة — إضافات فقط

| الكيان | الحقول المطلوبة في Sprint 2 | القيود والتوافق |
|---|---|---|
| User | `avatarAssetId: ObjectId\|null → MediaAsset`؛ توسيع `instructorProfile: {bio, expertise, links}` | الملف embedded كما في الرسم والكود؛ لا collection منفصلة. عدم عرض البريد أو حقول الأمن في صفحة المحاضر العامة |
| InstructorApplication | إضافة `links: [{label: string, url: string}]` اختيارية، default `[]` | snapshot الروابط المقدمة للمراجعة؛ تُنسخ إلى instructorProfile عند القبول داخل نفس transaction، ولا تتغير لاحقًا بتعديل الملف العام |
| Category | الحقول الحالية `name, slug, isActive` | unique slug كما هو؛ الأرشفة تستخدم `isActive=false` ولا تمس الكورسات أو الالتحاقات التاريخية |
| Course | `shortDescription: string`, `level: beginner/intermediate/advanced/all_levels`, `language: ar/en`, `coverAssetId: ObjectId\|null`, `submittedAt/reviewedAt/publishedAt: Date\|null`, `reviewedBy: ObjectId\|null → User`, `rejectionReason: string\|null` | الحفاظ على الحقول الحالية والـslug الثابت و`curriculumRevision`؛ لا حذف `coverKey` قبل mapping وتوثيق التوافق. إضافة `archived` للقراءة المستقبلية دون endpoint أرشفة الآن |
| Lesson | `description: string`, `attachments: ObjectId[] → MediaAsset`, `signedPlaybackId: string\|null` | مرفق PDF واحد حاليًا، مع إبقاء array كما في الرسم؛ playbackId مخفي افتراضيًا ويُعرض فقط ضمن تصريح التشغيل. الحفاظ على حالات ومحاولات Mux الحالية |
| Section | لا تغيير وظيفي للحقول | ترتيب ضمن الكورس وملكية عبر Course كما في Sprint 1 |

Zod: الوصف المختصر 10–300 حرف، وصف الدرس حتى 10000 حرف نص عادي، reason الرفض 5–500 حرف. تحفظ المسودات القديمة بقيم فارغة/nullable للحقول الجديدة؛ يجب أن يملأ المحاضر البيانات قبل التقديم. `level/language` لا تُخمن للبيانات القديمة. الصورة المطلوبة للنشر يجب أن ترتبط بـMediaAsset جاهز.

**روابط المحاضر — سد فجوة INS01 ضمن S2-02:** schema مشتركة للطلب والملف: حتى 5 عناصر، كل عنصر strict `{label,url}`؛ label نص عادي من 1–80 حرفًا بعد trim، وurl حتى 2048 حرفًا وHTTPS فقط، دون username/password أو control characters. يستخدم URL parser للتطبيع، وتُرفض الروابط المتطابقة بعد التطبيع. لا يقوم السيرفر بجلب الرابط أو استخراج preview منه.

- إنشاء الطلب يقبل links اختياريًا ويخزن `[]` عند غيابه؛ تعرضه DTOs لصاحب الطلب والأدمن. عند القبول تُنسخ الروابط التي راجعها الأدمن إلى الملف العام، وعند الرفض لا تُنشر.
- `PATCH /instructor/profile`: غياب links يحافظ على الموجود، و`links: []` يمسحه، وإرسال array يستبدل القائمة كاملة؛ null والـbody الفارغ مرفوضان. تعديل الملف لا يغيّر طلب الانضمام التاريخي.
- DTO العام للمحاضر المقبول يعرض links؛ الفرونت يعرض label كنص ويستخدم `rel="noopener noreferrer"` عند فتح نافذة جديدة. links معلومات يقدّمها المحاضر، وليست روابط تحققت المنصة من ملكيتها أو محتواها.
- السجلات القديمة تعرض links كـ`[]` دون فرض إعادة تقديم الطلب أو الموافقة. تُحافظ migrations على أي روابط موجودة ولا تمسحها، مع نفس قيود الحجم والنوع في Mongoose للكتابات خارج HTTP.

فهارس Course الإضافية: `{status, publishedAt desc, _id desc}` للكتالوج، `{status, submittedAt, _id}` للمراجعة، وفهرس الاسم المطبع للبحث prefix. تضيف الخدمة `titleSearch` بتطبيع Unicode والـcase والفراغات من title، مع نفس التطبيع للاستعلام؛ بحث يبدأ بالاسم، وليس full-text ranking أو fuzzy search. يقبل البحث العربي والإنجليزي؛ يُذكر سلوك prefix صراحة في عقد الفرونت.

Auth tokens والجلسات وحقول password reset الحالية تبقى كما هي؛ `AUTH_TOKEN` في الرسم وصف مفاهيمي وليس سببًا لدمج refresh sessions أو تغيير حماية Sprint 1.

### 4.3 MediaAsset — إضافة لدعم Cloudinary

| الحقل | النوع والغرض |
|---|---|
| ownerId | ObjectId → User؛ مالك الرفع |
| purpose | `avatar / course_cover / lesson_attachment` |
| targetId | ObjectId للسجل المقصود، يُتحقق من نوعه حسب purpose |
| provider | `cloudinary` |
| publicId / providerAssetId | معرّفات يولد السيرفر أولها ويتحقق من ثانيها من المزود؛ لا يعتمد على رابط العميل |
| resourceType / deliveryType | النوع الفعلي بالمزود؛ PDF يكون محميًا لا public upload |
| status | `pending / ready / rejected / deleting / deleted` |
| bytes / format / originalName | metadata مؤكدة؛ الاسم للعرض بعد التنقية فقط |
| expiresAt / attachedAt | انتهاء intent ووقت الربط بالسجل |

الفهارس: unique publicId، وpartial unique providerAssetId عند وجود string، وفهرس `{status, expiresAt}` لتنظيف المتروك. لا تُحذف الملفات المرتبطة قبل نجاح استبدال المرجع؛ التنظيف المؤجل يعيد فحص المرجع. الحذف الفعلي والـretries عبر outbox بمهام مستقلة عن Mux مع lease وعداد failures وexhaustedAt.

### 4.4 Enrollment وLessonProgress

| الكيان | الحقول |
|---|---|
| Enrollment | `studentId → User`, `courseId → Course`, `sourceOrderId → Order\|null`, `status: active/revoked`, `lastLessonId → Lesson\|null`, `enrolledAt`, `completedAt\|null`, `revokedAt\|null` |
| LessonProgress | `enrollmentId → Enrollment`, `lessonId → Lesson`, `completedAt\|null` |

- unique `{studentId, courseId}` وunique `{enrollmentId, lessonId}`؛ progress يرتبط بالالتحاق كما في الرسم وليس userId منفصلًا.
- فهرس المكتبة `{studentId, status, enrolledAt desc, _id desc}`. sourceOrderId=null للمجاني؛ الاشتراك المدفوع يشير لطلب paid.
- حفظ إكمال/عدم إكمال الدرس idempotent. lastLessonId يجب أن ينتمي للكورس المتاح للطالب.
- النسبة تحسب عند القراءة من الدروس الحالية المتاحة؛ لا تعتمد على عدد progress records دون join/filter للدروس الموجودة. صفر دروس يعطي 0%.
- `completedAt` في Enrollment يعبر عن اكتمال المنهج الحالي ويُراجع عند تغير المنهج مستقبلًا؛ ليس مصدر احتساب النسبة. إعادة الشراء بعد refund في Sprint 3 تعيد تفعيل نفس Enrollment وتحديث sourceOrderId وفق سياسة الاسترداد حينها.

### 4.5 Order — كورس واحد وsnapshot ثابتة

| الحقل | النوع/القيد |
|---|---|
| studentId / courseId / instructorId | ObjectId references كما في الرسم؛ instructorId snapshot لمالك البيع |
| courseTitleSnapshot | string وقت بدء الشراء |
| amountMinor / currency | integer وEGP؛ السعر من السيرفر |
| commissionBps | integer؛ 2000 للـMVP |
| platformAmountMinor / instructorAmountMinor | integer؛ المجموع يساوي amountMinor |
| status | `pending / paid / failed / cancelled / refunded` |
| expiresAt / paidAt | Date؛ expiry لا يحذف السجل ولا يثبت فشل الدفع وحده |
| purchaseSlotActive | boolean إضافة لمنع أكثر من محاولة نشطة/بيع محتفظ به لنفس الطالب والكورس |

الفهارس: partial unique `{studentId, courseId}` حيث purchaseSlotActive=true، وفهارس تاريخ الطالب والأدمن وstatus/expiresAt. يظل slot نشطًا للطلب paid؛ يُحرر بعد التأكد من إغلاق محاولة فاشلة/منتهية، أو استرداد كامل لاحقًا. لا تُعدل snapshot بعد ربط الطلب بمحاولة الدفع.

### 4.6 Payment وWebhookEvent

| الكيان | الحقول الأساسية |
|---|---|
| Payment | `orderId → Order`, `provider: stripe`, `idempotencyKey`, `checkoutSessionId\|null`, `paymentIntentId\|null`, `amountMinor`, `currency`, `status: created/processing/succeeded/failed/refunded`, `paidAt\|null` |
| WebhookEvent | `provider`, `eventId`, `eventType`, `status: pending/processing/processed/failed/ignored`, `attempts`, `lastReceivedAt`, `processedAt\|null`, `lastError\|null` |

Payment: unique orderId لمحاولة الدفع الخاصة بالطلب، unique `{provider,idempotencyKey}`، partial unique `{provider,checkoutSessionId}` و`{provider,paymentIntentId}` عند وجود القيمة. إعادة محاولة الشبكة تستخدم نفس key؛ محاولة شراء جديدة بعد إغلاق القديمة تنشئ Order/Payment جديدين.

WebhookEvent: unique `{provider,eventId}`، مع `payload` موثوق محدود الحجم ومخفي من DTOs، و`availableAt/leaseId/leaseUntil` لدعم durable inbox وإعادة المحاولة. lastError كود آمن فقط. لا يعاد فتح processed عند تكرار الحدث. worker ينفذ أثر الحدث وprocessed داخل transaction واحدة.

يمكن إرجاع 2xx بعد حفظ الحدث الموثق بصورة دائمة؛ فشل الحفظ يعيد 5xx. التوقيع غير الصحيح يعيد 400 بلا تخزين. أحداث غير مدعومة تُسجل ignored دون أثر مالي. إعادة استقبال حدث failed لا تُنشئ نسخة جديدة، وتوفر الخطة أمر replay إداري محلي بحدود واضحة.

### 4.7 EarningEntry — ledger قابل للامتداد

حقول الرسم: `instructorId → User`, `orderId → Order`, `refundId → Refund|null`, `payoutId → Payout|null`, `type: sale/refund_adjustment`, `amountMinor`, `currency`.

إضافات موثقة: `status: pending/eligible/included_in_payout/reversed` و`eligibleAt|null`. في Sprint 2 تنشأ sale واحدة بمبلغ instructorAmountMinor وحالة pending؛ لا worker لتحويل eligible ولا payout endpoints.

فهارس: partial unique orderId لtype=sale، وpartial unique refundId لtype=refund_adjustment، وفهرس `{instructorId,status,createdAt}`. قيود البيع لا يعاد حسابها من سعر الكورس الحالي؛ refund adjustment سالب مستقبلًا. نسبة المنصة محفوظة في Order ولا تتطلب ledger مكررًا الآن.

### 4.8 Refund وPayout — تصميم مستقبلي فقط

- Refund كما في الرسم: paymentId، providerRefundId، idempotencyKey، amountMinor، currency، status، reason، initiatedBy، completedAt. unique providerRefundId وidempotencyKey. حالات مبدئية `pending/succeeded/failed` تثبت نهائيًا في Sprint 3.
- Payout كما في الرسم: instructorId، amountMinor، currency، status، transferReference، createdBy، paidBy، paidAt؛ الحالات `draft/pending/paid/cancelled`. الربط بالمستحق عبر EarningEntry.payoutId مع حجز ذرّي يمنع ضمه مرتين.
- لا إنشاء fake refunds/payouts لإكمال الرسم، ولا اعتبار الوظائف المالية المستقبلية مكتملة في Sprint 2.

## 5. قواعد العمل والصلاحيات

### النشر والكتالوج

- المحاضر يجب أن يكون active وapproved ومالك الكورس. الطالب/المحاضر/الأدمن يستخدمون التحقق الحالي من الجلسة والحساب.
- `draft → pending_review → published|rejected`؛ `rejected → draft` بعملية إعادة فتح واضحة. استثناء تشغيلي لحذف فيديو منشور مؤكد من Mux: `published → unavailable` مع حدث system audit و`unavailableAt` داخل نفس transaction؛ `unavailable → draft` بإعادة فتح صريحة للإصلاح ثم إعادة التقديم والمراجعة. لا يظهر `unavailable` في الكتالوج أو Checkout. reason إلزامي للرفض، وقرار المراجعة وتوقيته وصاحبه محفوظ في audit event داخل نفس transaction.
- تقديم الكورس والنشر يتحققان من العنوان والوصف والوصف المختصر والمستوى واللغة والغلاف والتصنيف النشط والسعر، وقسم ودرس واحد على الأقل، وعدم وجود أقسام فارغة أو دروس فيديو غير ready. الأهداف والمتطلبات وفق حدود schemas الحالية.
- كل تعديل محتوى/ربط ملف/تقديم/قرار مراجعة يشارك قفل Course المنطقي الحالي لمنع اعتماد محتوى قد تغير بالتزامن. أحداث فشل/حذف فيديو من المزود لا تُتجاهل بسبب المراجعة؛ النشر يعيد فحص جاهزية المحتوى.
- الكتالوج يعرض published فقط، ويُرجع DTO عامًا: تفاصيل ومدرس وملخص منهج وعلامات Preview ومدد؛ لا upload IDs أو signed URLs أو مرفقات خاصة أو بيانات الحساب.
- فلترة `categoryId`, `pricing=all|free|paid`، بحث `q` prefix حتى 100 حرف، `page=1`, `limit=20` بحد أقصى 100؛ ترتيب الافتراضي publishedAt desc ثم _id desc.
- تعطيل التصنيف يمنع الاختيار والتقديم الجديد؛ لا يسحب وصول المشترين أو يخفي كورسات منشورة تلقائيًا.

### الوسائط

- صور JPEG/PNG/WebP حتى 5 MiB، وPDF حتى 20 MiB؛ حدود قابلة للضبط وupload presets مقيدة على المزود. intent صالح 10 دقائق للتأكيد؛ صلاحية توقيع المزود لا توصف زورًا بأنها تطابق هذه المدة.
- السيرفر يثبت owner وtarget وpublicId وdelivery type وoverwrite=false؛ التأكيد يتحقق عبر المزود من النوع والحجم والمعرف والملكية، ويرفض إعادة الربط أو intent منتهيًا. لا يثق في MIME أو bytes التي يرسلها المتصفح.
- PDFs تُرفع protected/authenticated، مع اختبار أن الأصل وأي نسخة مشتقة لا تتاح برابط عام. فحص تفعيل تسليم PDF وقيود الحساب ضمن spike؛ عدم نجاح الخصوصية يمنع تسليم Story.
- signed PDF download صالح 60 ثانية؛ signed playback صالح 15 دقيقة مع expiresAt في الاستجابة ليجدد الفرونت قبل الانتهاء. الروابط Bearer قابلة للاستخدام حتى انتهائها؛ تعليق الحساب يمنع إصدار روابط جديدة ولا يسحب رابطًا صادرًا فورًا.
- Preview يسمح بفيديو درس isPreview في كورس published دون login؛ لا يسمح بتنزيل PDF بلا enrollment. صاحب الكورس والأدمن يستطيعان الوصول للمراجعة دون Enrollment وهمي.
- Mux playback policy تكون signed فقط. تهيئة playback للأصول الحالية تستعلم أولًا ثم تعيد استخدام المعرف أو تنشئه بصورة قابلة للتكرار، ولا تستدعي المزود داخل transaction.
- PDF يقدم كتنزيل، ولا يعرض inline HTML أو SVG. ربط الملفات وفحص محتواها وحدود presets وإزالة الملفات المرفوضة جزء من Story الوسائط.

### الدفع والاستحقاق

- Checkout لكورس published ومدفوع فقط؛ الطالب active وبريده موثق. المحاضر لا يشتري كورسه. العميل يرسل courseId فقط، لا سعرًا أو عمولة أو instructorId أو return URL مفتوحًا.
- Stripe Test Mode مع hosted Checkout وcard فقط في Sprint 2؛ تؤخذ success/cancel URLs من إعدادات allowlisted. cancel redirect لا يغيّر order state.
- pending attempt يُستأنف بنفس Checkout؛ تعطل الشبكة بعد طلب إنشاء الجلسة يُحل بنفس idempotencyKey. قبل تحرير purchase slot يتم تأكيد expiration/عدم الدفع من Stripe؛ لا يعتمد على ساعة التطبيق وحدها.
- snapshot السعر والعمولة تحفظ قبل Checkout وتطابق المبلغ والعملة عند التأكيد. تعديل السعر لاحقًا لا يغير عقد الشراء السابق.
- نجاح الدفع يتطلب event موثقًا وحالة paid والتحقق من session/payment/order references والعملة والمبلغ وTest Mode. تسجيل event وحده ليس إثبات تحصيل.
- يتم تحديث Order وPayment وإنشاء Enrollment وEarningEntry وإكمال event داخل transaction واحدة. unique constraints تمنع الأثر المكرر حتى لو جاءت event IDs مختلفة لنفس session.
- أحداث الفشل/الانتهاء المتأخرة لا تعكس paid إلى failed. mismatches تبقى فشلًا قابلًا للمراجعة بكود آمن دون منح وصول.
- خدمة reconciliation تعالج pending attempts وأخطاء إنشاء الجلسة؛ لا تمنح Enrollment من صفحة النجاح أو polling. الأحداث الناقصة تُستعاد كأحداث موثقة عبر Stripe API إلى نفس inbox أو يعاد إرسالها من Stripe، دون مسار fulfillment مستقل.
- طلب تم تحصيله يُسجّل ماليًا حتى لو تغيرت حالة الحساب بعد بدء Checkout؛ خدمة الوصول تمنع الحساب المعلق. لا يتم إسقاط بيع محصل بسبب تغيير الحالة.
- الكورس المجاني ينشئ Enrollment واحدًا مباشرة؛ لا Order paid أو Payment أو Earning. BR04 استثناء صريح من صياغة webhook-only في بعض أجزاء الـMVP.

## 6. API Contract المخطط

كل المسارات تحت `/api/v1`. هذا جدول **مخطط**؛ عقود JSON الكاملة وأمثلة الأخطاء تُثبّت داخل Story قبل ربط الفرونت.

| Method / Path | الدور والمدخل الأساسي | الناتج/السلوك |
|---|---|---|
| POST /media/upload-intents | authenticated؛ `{purpose,targetId}` | assetId، upload params موقعة، limits، expiresAt |
| POST /media/:assetId/confirm | المالك؛ دون metadata موثوقة من العميل | تأكيد وربط الملف بعد تحقق المزود |
| DELETE /media/:assetId | المالك مع قواعد حالة الكورس | فصل المرجع وجدولة التنظيف؛ الغلاف لا يحذف من كورس منشور |
| POST /instructor-applications | المسار الموجود؛ `{bio,expertise,links?}` | إضافة backward-compatible للروابط الاختيارية؛ public signup يظل student فقط |
| GET /instructors/:instructorId | عام؛ approved فقط | name، avatar، bio، expertise، links؛ لا email |
| PATCH /instructor/profile | instructor؛ `{bio?,expertise?,links?}` | حقل واحد على الأقل؛ استبدال links بالكامل عند إرسالها |
| GET /categories | عام | active categories؛ قائمة paginated |
| GET /admin/categories | admin | قائمة مع فلتر isActive |
| POST /admin/categories | admin؛ `{name,slug}` | إنشاء unique slug |
| PATCH /admin/categories/:categoryId | admin؛ `{name?,slug?,isActive?}` | تحديث أو أرشفة منطقية |
| GET /instructor/courses | المالك؛ إضافة status filter | توسيع endpoint الحالي لكل الحالات؛ default draft يحفظ التوافق |
| GET /instructor/courses/:courseId | المالك | عرض حالته وقرار المراجعة دون تغيير الملكية |
| POST /instructor/courses/:courseId/submit-review | المالك | 200 pending_review أو 409 حالة/محتوى غير صالح |
| POST /instructor/courses/:courseId/reopen | المالك؛ rejected فقط | draft مع حفظ تاريخ القرار |
| GET /admin/courses | admin؛ status/page/limit | قائمة للمراجعة |
| GET /admin/courses/:courseId | admin | محتوى المراجعة وبياناته |
| PATCH /admin/courses/:courseId/review | admin؛ `{decision: approve\|reject,reason?}` | published/rejected؛ reason مطلوب للرفض |
| GET /courses | عام؛ q/categoryId/pricing/page/limit | published courses فقط |
| GET /courses/:slug | عام | تفاصيل عامة ومنهج دون أسرار الوسائط |
| POST /courses/:courseId/checkout | طالب موثق | `{order,checkoutUrl,expiresAt}`؛ 201 للجديد/200 للمستأنف |
| POST /webhooks/stripe | توقيع Stripe بدل JWT | durable event ingestion؛ raw body |
| POST /courses/:courseId/enroll | طالب موثق؛ مجاني فقط | 201 enrollment أو 200 عند التكرار |
| GET /users/me/courses | الطالب | المكتبة مع pagination والتقدم |
| GET /users/me/courses/:courseId | الطالب الملتحق | منهج التعلم وآخر درس والتقدم |
| GET /users/me/orders | الطالب | سجل الطلبات الخاص به |
| GET /users/me/orders/:orderId | صاحب الطلب | حالة polling بعد الدفع؛ لا ينشئ التحاقًا |
| GET /admin/orders | admin | طلبات بفلاتر status/page/limit |
| GET /admin/orders/:orderId | admin | بيانات الطلب والدفع الآمنة |
| GET /lessons/:lessonId/playback | ملتحق/مالك/admin أو Preview عام | playbackId، token، expiresAt؛ Cache-Control: no-store |
| GET /lessons/:lessonId/attachments/:assetId/download | ملتحق/مالك/admin | url مؤقت وexpiresAt؛ no-store |
| PUT /users/me/courses/:courseId/lessons/:lessonId/progress | ملتحق؛ `{completed:boolean}` | تقدم الدرس ونسبة الكورس |
| PUT /users/me/courses/:courseId/last-lesson | ملتحق؛ `{lessonId}` | آخر درس مع تحقق الانتماء |

أخطاء domain مخططة: `COURSE_NOT_READY`, `INVALID_COURSE_STATE`, `COURSE_ALREADY_ENROLLED`, `PAYMENT_PENDING`, `PAYMENT_PROVIDER_UNAVAILABLE`, `MEDIA_NOT_READY`, `MEDIA_UPLOAD_INVALID`, `ENROLLMENT_REQUIRED`. اعتماد أسماء نهائية موحدة في OpenAPI داخل Story، مع 400 validation، 401 جلسة، 403 صلاحية، 404 مورد مخفي/غير موجود، 409 تعارض، 503 مزود غير متاح.

## 7. Backlog التنفيذ والاعتماديات

التقديرات تشمل اختبارات Story وتوثيقها. لا تُفتح ميزة رئيسية ثانية قبل إغلاق الحالية؛ إعداد frontend mocks يمكن أن يسير بالتوازي لدى الفرونت.

| Story | العمل ومعيار القبول الأساسي | الاعتماديات | الجهد |
|---|---|---|---|
| S2-01 — Contracts & provider proof | تثبيت العقود وسياسات الوصول؛ إثبات Cloudinary PDF خاص وصورة، Mux signed playback، Stripe Test checkout + signed webhook؛ توثيق الإعدادات والحدود وأي blocker | Sprint 1 | 5–8h |
| S2-02 — Content data completion | إضافة بيانات الكورس ووصف الدرس والملف العام وروابط طلب المحاضر حتى القبول والعرض؛ schemas وDTOs وفهارس وتوافق السجلات القديمة؛ المسودات لا تنشر ناقصة | S2-01 | 5–8h |
| S2-03 — Cloudinary media | intents/confirm/delete والملكية وحدود الملفات وcleanup؛ رفض تزوير metadata وإعادة ربط ملف شخص آخر؛ avatar/cover/PDF يعمل فعليًا | S2-02 | 9–14h |
| S2-04 — Categories | إنشاء وتعديل وأرشفة وتصنيف عام؛ منع duplicate slug وعدم تدمير المراجع؛ التكامل مع seed القائم دون إعادة تنشيط أرشيف بالخطأ | S2-02 | 3–5h |
| S2-05 — Review & publish | حالات وتواريخ وreasons وaudit؛ rejected يعاد فتحه؛ pending/public مقفولان للتعديل؛ التزامن لا ينشر نسخة غير مراجعة | S2-03,04 | 7–11h |
| S2-06 — Catalog & details | published فقط، prefix search عربي/إنجليزي، فلاتر ومناهج وDTO آمن؛ لا تسريب فيديو أو PDF | S2-05 | 5–8h |
| S2-07 — Orders & Checkout | Order/Payment والفهارس وsnapshot وadapter؛ منع ازدواج الطلبات، استئناف الطلب والتعافي من timeout دون جلسة ثانية | S2-06 | 9–14h |
| S2-08 — Payment fulfillment | WebhookEvent inbox وworker وreplay؛ paid/Enrollment/EarningEntry ذرية؛ نجاح واحد للأحداث المكررة والمتزامنة؛ failures لا تقلب paid | S2-07 | 10–16h |
| S2-09 — Enrollment, library & orders | التحاق مجاني idempotent، مكتبة وسجل طلبات وقراءة أدمن؛ لا Order/Earning وهمي للمجاني | S2-08 | 5–8h |
| S2-10 — Protected learning access | خدمة صلاحيات مشتركة، Mux signed playback وترقية أصول موجودة، PDF مؤقت؛ إثبات منع الطلبات غير الملتحقة وPreview مضبوط | S2-03,05,09 | 7–11h |
| S2-11 — Progress | unique progress/upsert، completed true/false وlastLesson؛ حساب ديناميكي والتأكد من انتماء الدرس | S2-10 | 4–6h |
| S2-12 — Staging acceptance & handoff | الرحلة الحقيقية كاملة واختبارات الفشل؛ verify وOpenAPI وdemo وoperating notes؛ توثيق نتائج فعلية | كل ما سبق | 6–10h |

المجموع المبدئي بعد تضمين مسار links الكامل **75–119 ساعة تنفيذ**. نحتفظ بـ20% من إجمالي السعة للاجتماعات والمراجعة والعوائق؛ إذًا السعة الكلية المطلوبة تقريبًا **94–149 ساعة** (`ceil(executionHours / 0.8)`). هذه تقديرات تخطيطية، وليست إنتاجية مقاسة أو وعدًا بالتسليم. يتحدد عدد الأسابيع وفق السعة الفعلية، وتُراجع التقديرات بعد S2-01 ثم أسبوعيًا على أساس الساعات الفعلية والعوائق؛ تغيير نطاق أو موعد يُسجّل بوضوح. لا تُحذف حماية الدفع أو المرفقات لتناسب موعدًا.

### تتبع متطلبات الـMVP

| Stories | المرجع ومعنى التغطية |
|---|---|
| S2-01 | الأقسام 13 و14 و16: حماية الخدمات، adapters، العقود وبيئة الاختبار |
| S2-02, S2-03 | STU03، INS01/03/05/06، القسم 7.1: استكمال روابط طلب المحاضر والملف العام وبيانات العرض والصور والوصف والمرفقات |
| S2-04 | ADM04: إدارة التصنيفات وأرشفتها |
| S2-05 | INS07/08، ADM05، BR01/02/10: اكتمال المحتوى والمراجعة والرفض المسبب |
| S2-06 | STU04/05/06، القسم 6.1: الكتالوج والبحث والتفاصيل |
| S2-07, S2-08 | STU08، BR03، القسم 9.2: الشراء والتحقق من الدفع وثبات snapshot ومنع التكرار؛ الاسترداد مؤجل |
| S2-09 | STU09/12، ADM07، BR04: المكتبة والطلبات والالتحاق المجاني |
| S2-10 | STU07/10، القسم 4.1: Preview والوصول المحمي |
| S2-11 | STU11، BR05/06: التقدم الديناميكي؛ نشر دروس جديدة يصبح متاحًا مع إدارة النسخ في Sprint 3 |
| S2-12 | الأقسام 15 و16 و20: اختبار الرحلة والتكامل والتسليم؛ بنود التسويات والإنتاج التجاري تبقى معلقة |

## 8. اختبارات المخاطر ومعايير القبول

### Unit / contract

- Zod strict schemas وinvalid ObjectIds وmass assignment وpagination وحدود النصوص والمال.
- حساب 20/80 بما في ذلك مبالغ لا تقبل القسمة على 5، ورفض تجاوز safe integers.
- adapters موكدة بـtest doubles، دون طلبات مدفوعة حقيقية ضمن `npm test`.
- permissions matrix لكل route، وDTO allowlists واستجابات no-store والأخطاء الموحدة.
- links: غيابها، قائمة فارغة، 5 روابط ورفض السادسة، duplicate URLs بعد التطبيع، label غير صالح، credentials داخل URL، ورفض HTTP/javascript/data protocols؛ التحقق لا يجلب أي رابط خارجي.
- rate limits: الطلب حتى الحد مسموح والطلب التالي يعيد 429 دون استدعاء المزود أو تغيير البيانات؛ عزل المستخدمين والـnamespaces، وتجدد النافذة وRetry-After، و503 عند تعطل shared store وفق السياسة أدناه.

### MongoDB integration — isolated replica-set test database

- ملف شخص آخر/كورس آخر/درس خارج الكورس مرفوض؛ claim وconfirm متزامنان لا يربطان ملفًا مرتين.
- تعديل منهج متزامن مع التقديم أو المراجعة، وwebhook يحول فيديو إلى failed قبل النشر.
- partial unique purchase slot وCheckout مكرر وtimeout بعد إنشاء جلسة Stripe وقبل حفظ المرجع.
- webhook مكرر بنفس ID، event IDs مختلفة لنفس الدفع، concurrent workers، expired lease، shutdown أثناء المحاولة، وعدم استنفاد retry بسبب الإغلاق وحده.
- فشل transaction بين paid وEnrollment وEarningEntry يرجع جميعها، ثم ينجح retry مرة واحدة.
- mismatch المبلغ/العملة/المستفيد/وضع test لا يمنح وصولًا، وsuccess redirect المزور لا يغيّر DB.
- وصول failure/expired بعد paid لا يسحب الالتحاق، وعدم إطلاق checkout آخر بينما حالة الأول غير محسومة.
- تسجيل مالي صحيح إذا عُلّق المستخدم أثناء الدفع؛ طلب playback من المعلق مرفوض.
- free enrollment متزامن سجل واحد دون أثر مالي؛ طلب شراء بعد وجود التحاق مرفوض.
- completed/lastLesson متزامنان، درس من كورس آخر، completed=true متكرر، uncomplete، واحتساب النسبة من الدروس الصحيحة فقط.
- عدم تراجع اختبارات Sprint 1؛ migrations لا تمحو البيانات أو تغيّر hashes/الجلسات.
- تقديم طلب بروابط ثم موافقته ينقل الروابط ذريًا؛ الرفض لا ينشرها؛ تغيير روابط الملف لا يغير الطلب الأصلي؛ حساب قديم بلا links يظل يعمل.
- محاولات تغيير title أو price أو cover أو section/lesson في pending_review/published ترفض دون side effects، بما فيها confirm/delete للوسائط. webhook مزود صحيح يظل قادرًا على تسجيل الحالة الفعلية للفيديو.

### Staging — إثبات فعلي منفصل عن automated tests

- حسابات student/instructor/admin مستقلة، وتجربة upload من متصفح ثم webhook حقيقي وتشغيل فيديو وتنزيل PDF.
- اختبار رابط PDF غير مصرح به، انتهاء رابط التنزيل وتوكن التشغيل، وعدم وجود public playback policy.
- Stripe Test: نجاح ورفض بطاقة وإغلاق Checkout وإعادة إرسال event وتأخر worker ثم استرداد عمله؛ رفض توقيع غير صحيح.
- webhook burst ضمن الحمل التجريبي المسجل يُحفظ دون limiter المستخدمين؛ التكرار لا يضاعف inbox أو الأثر المالي، وbody فوق الحد يعيد 413. فشل الحفظ لا يعيد نجاحًا وهميًا.
- التأكد من إعداد Mux: test assets قصيرة العمر ومحدودة المدة؛ يمكن استخدامها لإثبات التكامل مع تسجيل ذلك، ولا تُحسب تجربة كورس طويل ناجحة تلقائيًا. أصول Staging المستمرة تحتاج ميزانية وإعدادًا مناسبين.

## 9. البيئة والمهاجرات والتشغيل

- إضافة env validation لـCloudinary cloud name/key/secret وupload preset IDs، Stripe test secret/webhook secret وallowlisted checkout URLs، Mux signing key ID/private key، وTTLs/limits المحددة أعلاه.
- الأسرار من البيئة فقط؛ `.env.example` placeholders دون مفاتيح فعلية. مفاتيح توقيع Mux مستقلة عن API tokens.
- raw-body webhook routes قبل JSON parser؛ سياسة الأحجام والـrate limits في القسم التالي، وعدم وضع Stripe webhook وراء JWT أو origin-required middleware الخاص بالمتصفح.
- migration قابلة لإعادة التشغيل وdry-run: إضافة حقول nullable، titleSearch، وربط وسائط legacy إن وُجدت بمصدر موثوق؛ لا صور وهمية ولا أسعار مخمنة. بناء unique indexes بعد اكتشاف duplicates والإبلاغ عنها دون حذف تاريخ مالي.
- ترقية signed playback عملية provider-aware قابلة للاستئناف؛ الأصل المحذوف/منتهي الصلاحية يعلّم unavailable ويطلب إعادة رفعه.
- workers ذات leases وbackoff وحد أقصى للفشل ومؤشر exhausted، وإيقاف بمهلة. وظائف reconciliation/replay لا تعمل أثناء tests إلا عند استدعائها صراحة.
- مراقبة pending events/oldest age وfailed payments وexhausted cleanup jobs، وإجراء موثق لإعادة المعالجة بعد تحديد السبب. إرجاع الاستجابات العامة لا يكشف lastError الداخلي.
- rollback يحافظ على سجلات المال والوسائط؛ يمكن تعطيل Checkout/إصدار تصاريح الرفع عند الحاجة، مع إبقاء استقبال payment events ومعالجتها متاحًا للطلبات القائمة.

### Rate limits — defaults تخطيطية قابلة للضبط

هذه قيم أولية خاصة بالتطبيق تُراجع بنتائج Staging، وليست حدودًا مفروضة من المزودين. لكل صف namespace مستقل و`*_MAX` و`*_WINDOW_MS` تتحقق منهما Zod كأعداد صحيحة موجبة، ونافذة افتراضية `60000` ms. توثّق المتغيرات في `.env.example` وOpenAPI عند تنفيذ Story. حدود Auth القائمة تظل كما هي.

| المجموعة / بادئة الإعداد | العمليات | المفتاح | الحد / دقيقة |
|---|---|---|---:|
| CHECKOUT_RATE_LIMIT | إنشاء/استئناف Checkout | authenticated userId | 5 |
| MEDIA_INTENT_RATE_LIMIT | إنشاء upload intent | authenticated userId | 10 |
| MEDIA_ACTION_RATE_LIMIT | confirm/delete للوسائط، مجموعة واحدة | authenticated userId | 30 |
| ENROLL_RATE_LIMIT | الالتحاق المجاني | authenticated userId | 10 |
| COURSE_REVIEW_RATE_LIMIT | submit-review/reopen، مجموعة واحدة | authenticated userId | 10 |
| INSTRUCTOR_PROFILE_RATE_LIMIT | تعديل الملف العام | authenticated userId | 10 |
| ADMIN_WRITE_RATE_LIMIT | كتابة التصنيفات ومراجعة الكورسات | authenticated admin userId | 30 |
| LEARNING_ACCESS_RATE_LIMIT | playback للمسجل وPDF download، مجموعة واحدة | authenticated userId | 30 |
| PREVIEW_RATE_LIMIT | playback للزائر | normalized client IP | 20 |
| LEARNING_PROGRESS_RATE_LIMIT | progress/last-lesson، مجموعة واحدة | authenticated userId | 60 |
| PRIVATE_READ_RATE_LIMIT | قراءات المكتبة والطلبات والمحاضر والأدمن الجديدة/الموسعة | authenticated userId | 120 |
| CATALOG_RATE_LIMIT | قراءات courses/categories/instructors العامة | normalized client IP | 120 |

- حد المستخدم على المجموعة كاملة عبر جميع courseIds/lessonIds، وليس لكل مورد، كي لا يتم تجاوزه بتغيير ID. يُطبق بعد التحقق من الجلسة وقبل عمليات المزود أو الكتابة المكلفة. حد IP عند الحافة يحمي تكلفة المصادقة وفق إعداد الاستضافة؛ لا يغني عن حد المستخدم.
- استخدام normalization مدعوم للـIPv6/IP وعدم الوثوق بـX-Forwarded-For إلا عبر TRUST_PROXY_HOPS الصحيح. public reads تستخدم IP حتى عند وجود مستخدم، وplayback يختار user أو anonymous bucket بعد تحديد الهوية؛ توكن غير صالح لا يتحول تلقائيًا إلى anonymous fallback.
- 429 داخل envelope الموحد بكود `RATE_LIMITED`، مع `Retry-After` بالثواني ورؤوس RateLimit. تُحسب المحاولات المرفوضة من domain أيضًا؛ rate limiting لا يحل محل idempotency أو unique indexes.
- في single API instance يستخدم store الذاكرة الحالي عبر factory؛ قبل تشغيل أكثر من instance يلزم shared-store adapter مستقل لكل namespace واختبار أن الحد موحد عبر النسخ. تعطل shared store يعيد 503 `RATE_LIMIT_UNAVAILABLE` للعمليات التي تعتمد عليه، دون fallback صامت إلى store محلي.
- Stripe/Mux webhooks مستثناة من مجموعات المستخدمين والقراءات العامة وAuth limiter. حماية مستقلة: raw body بحد 1 MiB لكل طلب، تحقق التوقيع، durable ingestion لـStripe، ومراقبة latency/backlog وحدود البنية التحتية؛ لا user limiter صغير يرفض bursts الصحيحة. لا يُرسل 2xx لحدث مطلوب تعذر حفظه. يوثّق حد body ويختبر في S2-01 قبل اعتماد إعداد Staging.
- تُنفذ سياسة كل مجموعة واختبارات حدودها ضمن Story الخاصة بها؛ S2-01 يثبت تصميم factory والأسماء، وS2-12 يسجل أثر الاختبار على قيم defaults.

## 10. تسليم الفرونت وDefinition of Done

BE1 يسلّم لكل Story العقد وأمثلة الطلبات والاستجابات والأخطاء وauth requirements قبل التكامل. FE1 يستهلك الكتالوج والدفع والمكتبة والتعلم، FE2 المحتوى والرفع والمراجعة، FE3 التصنيفات والمراجعة والطلبات.

حالات واجهة لازمة: upload pending/failed/ready، course rejected مع السبب، payment pending بعد العودة من Stripe مع polling bounded، retry آمن، enrollment required، playback token renewal، وحالة كورس/فيديو غير متاح. لا يحتفظ الفرونت بروابط خاصة كروابط دائمة ولا يعتبر redirect إثبات شراء.

**عقد تحرير الكورس في Sprint 2:** pending_review وpublished للقراءة فقط للمحاضر، بما في ذلك تصحيح typo وتعديل السعر والغلاف والمنهج؛ الخادم يعيد 409 `INVALID_COURSE_STATE` للمالك عند محاولة التعديل، ولا ينفذ تغييرًا جزئيًا. rejected يعرض السبب ويسمح فقط بعملية reopen قبل التعديل. على الفرونت عرض الحالة بوضوح وعدم تقديم زر تعديل يؤدي لفشل متوقع. تغييرات حالة الفيديو القادمة من المزود وقرارات الأدمن ليست عمليات تحرير للمحاضر وتظل تعمل. السماح بالتصحيح النصي البسيط بعد النشر مؤجل صراحة إلى Sprint 3 مع سياسة النسخ؛ هذا قيد مؤقت وليس تغييرًا لنطاق الـMVP النهائي.

الفرونت يعرض links في الطلب والملف، ويفهم الفرق بين عدم إرسالها ومسحها بقائمة فارغة. عند 429 يحترم Retry-After دون retry loop؛ polling الطلب يبدأ كل 5 ثوانٍ ثم يتراجع حتى 30 ثانية ويتوقف تلقائيًا بعد دقيقتين مع زر تحديث يدوي. انتهاء الانتظار لا يعني فشل الدفع ولا ينشئ Checkout آخر.

- [ ] Stories مختبرة ومراجعة وعقودها تطابق التنفيذ.
- [ ] المسار upload → review → publish → checkout → webhook → learn → progress يعمل على Staging.
- [ ] التحاق مجاني يعمل بلا سجلات مالية وهمية.
- [ ] لا Enrollment/Earning مكرر مع retry أو concurrency أو فشل transaction.
- [ ] غير الملتحق لا يشاهد محتوى مدفوعًا أو ينزل PDF خاصًا؛ Preview مطابق للسياسة.
- [ ] `npm run verify` ناجح على قاعدة اختبار معزولة، مع تسجيل العدد الفعلي وقت التسليم.
- [ ] بيانات demo ودليل env/migration/replay ومصفوفة الصلاحيات ونتائج Staging متاحة للفريق.
- [ ] ملاحظات Sprint 3 موثقة، ولم تُعلَّم Refund/Payout أو التعديل بعد النشر كميزات مكتملة.
- [ ] links مغطاة من طلب المحاضر حتى القبول والتعديل والعرض، مع توافق السجلات القديمة.
- [ ] حدود الطلبات و429/503 وRetry-After مختبرة، وwebhooks لا تخضع خطأً لحدود المتصفح/المستخدم.

### حالة تجهيز S2-12 — 2026-10-04

تم تجهيز دليل القبول والتسليم في `staging-acceptance.md` وسجل الأدلة في
`staging-evidence.md`، وأمر `npm run staging:status` للمراقبة التجميعية read-only
مع تشغيل صريح بـ`-- --execute`. الأمر لا يغير البيانات ولا يستدعي المزودين.
اختبارات Staging الحقيقية لم تُنفذ بعد؛ إعداد دليل واختبارات آلية لا يغلق S2-12
ولا بنود Definition of Done أعلاه. تُسجل النتائج الفعلية بعد تحديد بيئة Staging
وحسابات demo وموافقة تجربة المزودين وميزانية الأصول الخارجية.

## 11. المراجع التقنية

- [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media): الملفات المحمية والتنزيل المؤقت؛ يُثبت السلوك على حساب المشروع في S2-01.
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference): signed upload وmetadata وقيود التسليم.
- [Mux secured playback](https://www.mux.com/docs/guides/secure-video-playback): signed playback IDs ومفاتيح توقيع JWT.
- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment): التحقق من الدفع وتكرار الاستدعاءات.
- [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests): منع تكرار طلبات المزود.

هذه الوثيقة خطة، وليست سجل نتائج تنفيذ. عند تنفيذ كل Story تُسجّل أدلة القبول الفعلية، وأي تعديل في النطاق أو التصميم يُوثق قبل اعتماده.
