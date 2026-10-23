# Sprint 3 — Final MVP Closure Plan

> الحالة: خطة مقترحة للتنفيذ، وليست تقرير إنجاز أو عقد API منشورًا.
> المالك: BE1. التنفيذ تدريجيًا، Story واحدة ثم اختبارات ومراجعة وتسليم عقدها.
> التاريخ: 2026-10-05. النطاق: إغلاق رحلة الـMVP التجريبية، وليس إطلاقًا تجاريًا.
> توجيه المستخدم: هذا آخر Sprint للـMVP؛ أي نقص أساسي من Sprint 1 أو 2 يدخل الإغلاق هنا، ولا يُؤجَّل إلى Sprint 4.
> لا يتضمن إعداد هذه الخطة تنفيذ كود، أو تغيير بيانات، أو إجراء على GitHub.

## 1. مصادر الخطة وترتيب الاحتكام

1. [MVP — Version 1.0](../../docs/final_MVP.md): المتطلبات وقواعد العمل وحدود المنتج.
2. [Project Plan — Version 2.0](../../docs/Project_Plan.md): Sprint 3 في الأسبوعين 5–6، السعة والمخاطر وتوزيع الفريق.
3. [Sprint 2 plan](sprint_2_backend_plan.md)، الكود الحالي، [Payment operations](payment-operations.md)، و[Staging evidence](staging-evidence.md): ما يوجد فعلًا وما لم يُقبل بعد.
4. رسمتا الـschema اللتان أرسلهما المستخدم سابقًا: `WhatsApp Image 2026-09-12 at 7.52.21 AM (3).jpeg` و`(2).jpeg`. تمت مطابقة محتواهما مع نسختي المرجع في `O:\DEPI-Project\docs`: `WhatsApp Image 2026-09-12 at 7.52.21 AM (1).jpeg` للمستخدمين والمحتوى، و`WhatsApp Image 2026-09-12 at 7.52.21 AM.jpeg` للماليات. الملفات الأصلية للقراءة فقط، ولا تُنسخ أسرار أو تطبيقات منها.
5. صور الـflowchart المرسلة في هذه المحادثة: `Screenshot_2026-09-18_030642.png`، `030659.png`، `030718.png`، `030731.png`، داخل `C:\Users\DELL\Downloads`. الصور مراجع خارج المستودع؛ ليست ملفات مضمّنة فيه.

تعليمات داخل مستند مرجعي ليست طلبًا مستقلًا من المستخدم. عند التعارض نذكره ونطلب قرارًا، ولا نضيف ميزة أو نغيّر سياسة مالية بصمت. قرارات Sprint 2 المعتمدة مستمرة: `Order` لكورس واحد مع snapshot، لا `OrderItem` جديد؛ Cloudinary للصور وPDF، Mux للفيديو، Stripe Test Mode للدفع.

### 1.1 قراءة الـflowchart بدقة

| المسار في الصور | المرجع / النتيجة المطلوبة في Sprint 3 |
| --- | --- |
| التسجيل كطالب ثم التحقق والدخول | Regression لـSprint 1، لا إعادة بناء Auth |
| طلب محاضر → قبول أو رفض → إعادة تقديم | Regression؛ إعادة التقديم تحفظ سجل القرار القديم، ولا تمسحه |
| كتالوج → تفاصيل → preview → مجاني أو Checkout | Regression لـSprint 2؛ الأرشفة توقف الاكتشاف والشراء الجديد |
| webhook موثوق → Paid + Enrollment + 80/20 | الحفاظ على fulfillment الحالي؛ إضافة refund reconciliation دون تكرار قيد البيع |
| فشل الدفع → Failed | الفشل المؤكد من المزود فقط؛ إغلاق المتصفح أو redirect ليس دليل فشل أو نجاح |
| إنشاء محتوى → مراجعة → نشر → متابعة أرباح | إضافة تعديل المنشور المعزول، والمبيعات والأرباح للمحاضر |
| My Courses → مشاهدة / PDF / تقدم → اكتمال | الوصول مستمر للمشتري عند الأرشفة، ويتوقف عند استرداد كامل ناجح أو حظر مبرر |
| مستحقات مؤهلة → Payout → تحويل خارج النظام → Paid | تسوية داخلية يدوية؛ ليست Stripe Payout ولا تحويلًا آليًا |

الصور تبسّط الحالات الوسيطة: refund pending، تحويل مجهول النتيجة، أحداث متكررة، وإعادة الشراء بعد الاسترداد. هذه الحالات ليست ميزات جديدة؛ هي ضمانات لازمة لصحة المسارات الأصلية. إضافة دروس منشورة قد تخفض نسبة تقدم الطالب كما ينص الـMVP.

## 2. خط الأساس وحدود الإنجاز

### 2.1 الموجود محليًا

- Foundation، Auth والجلسات وreset password، الملفات الشخصية، طلبات المحاضرين، مسودات الكورسات والـcurriculum من Sprint 1.
- الصور وPDF المحمي وMux signed playback، التصنيفات والمراجعة والنشر والكتالوج من Sprint 2.
- Stripe Test Checkout، durable webhook inbox وworker/recovery، snapshots وsale `EarningEntry` بحالة `pending`.
- الالتحاق المجاني، المكتبة والطلبات، الوصول المحمي والتقدم، عقود OpenAPI وأدلة تشغيل.
- إغلاق النقصين المحددين من التدقيق: avatarUrl للملفات الشخصية، وcounts/duration لتفاصيل الكورس. راجع [سجل إغلاق Sprint 1/2](sprint_1_2_closure.md) للدليل المحلي والحدود؛ Staging لم يُقبل بذلك تلقائيًا.

نتيجة baseline المسجلة قبل إعداد هذه الخطة: 414 اختبارًا ناجحًا دون فشل أو skip، مع lint والتحقق من OpenAPI. هذه نتيجة تاريخية؛ نتائج تنفيذ إغلاق النواقص الأحدث في سجله المنفصل. توجد أدلة تجارب محلية فعلية للوسائط والدفع، منها Stripe webhook مباشر موقّع عولج دون recovery. لا تعادل قبول Staging.

### 2.2 غير منفّذ أو غير مقبول بعد

| البند | الحالة عند إعداد الخطة |
| --- | --- |
| Refund / Payout models وواجهاتهما | مخططان في الرسم؛ لا تنفيذ حالي |
| تحويل الأرباح من pending إلى eligible | لا worker أو سياسة معتمدة بعد |
| لوحات المحاضر المالية وdashboard الإداري | مطلوبة في هذا الـSprint |
| تعليق المستخدمين وتفعيله عبر admin API | `User.status` موجود؛ workflow الإداري غير منفّذ |
| الأرشفة مع الاحتفاظ بوصول المشترين | `archived` غير موجود في enum الحالي، وقراءات التعلم تشترط published |
| تعديل مادي منشور مع بقاء النسخة الحية | غير منفّذ؛ التعديل الحالي للمسودات فقط |
| قبول Sprint 2 على Staging | حالات A01–A19 كلها NOT RUN بحسب evidence الحالي |

لا نضع علامة Done لـSprint 2 قبل تنفيذ أدلته. يمكن بدء تصميم وسياسات Sprint 3 محليًا، لكن نشر الماليات على Staging يتطلب بوابة الدخول التالية، ويظل إغلاق Sprint 2 جزءًا ظاهرًا من العمل المتبقي.

### 2.3 بوابة الدخول

- [ ] تشغيل `npm run verify` على baseline الفعلي وتسجيل النتيجة، لا الاعتماد على عدد الاختبارات القديم.
- [ ] MongoDB replica set منفصل لـStaging، و`MONGO_TEST_URI` معزول عن التطبيق، ونسخة احتياطية قابلة للاستعادة.
- [ ] إثبات Checkout حقيقي Test Mode مع signed webhook → order/payment/enrollment/earning واحد لكل بيع.
- [ ] إثبات الصورة وPDF والفيديو المحميين، التجديد وانتهاء صلاحية الاعتماد، ورفض غير الملتحق.
- [ ] تنفيذ/جدولة كل A01–A19 مع Owner وتاريخ؛ لا اختزالها في payment happy path.
- [ ] اعتماد سياسات S3-01 قبل تنفيذ انتقالات الأموال أو النسخ المنشورة.

## 3. هدف Sprint 3 والنطاق

رحلة القبول: الأدمن يدير الحسابات ويؤرشف الكورس دون حرمان المشترين، المحاضر يرى مبيعاته ومستحقاته، الطلب المدفوع يُسترد بصورة موثوقة عند استحقاقه، المستحق الصافي يُسوّى يدويًا دون حجز أو دفع مكرر، والتعديل المادي للكورس المنشور لا يصل للطالب إلا بعد المراجعة. تسلَّم نسخة تجريبية موثّقة ومراقبة، مع تجارب استعادة وفشل وتكامل الأدوار الثلاثة.

داخل النطاق: ADM01/03/06/07/08/09/10، INS09/10، قاعدة تعديل المنشور، الاسترداد وعكس المستحق، وأدلة التشغيل/القبول المتبقية. ADM02/04/05 موجودة من الرحلات السابقة وتُختبر؛ مراجعة تعديل المنشور توسّع ADM05 دون إعادة كتابة مراجعة النشر الأول.

هذه ليست خطة ماليات فقط: تشمل إغلاق كل STU01–STU12 وINS01–INS10 وADM01–ADM10، قواعد BR01–BR10، المتطلبات غير الوظيفية، القبول المتكامل وحزمة التسليم في الـMVP والـProject Plan. الوظيفة الموجودة تُثبت باختبار، والوظيفة الناقصة تُستكمل في نفس Sprint. تفاصيل التغطية في §17؛ لا يكون أي متطلب أساسي بلا Story ودليل وصاحب مسؤولية.

التسليم النهائي للباك إند وحده لا يساوي تسليم المنتج. `frontend` في هذا checkout يحتوي `.gitignore` فقط عند الفحص؛ لا توجد هنا أدلة تنفيذ شاشات React الخاصة بالفريق. إغلاق الواجهة والتكامل جزء من بوابة التسليم، يتابعه FE1/FE2/FE3 وUX1 في مشروعهم الفعلي، ولا يفترض هذا الملف أن واجهاتهم موجودة أو مكتملة. تعديل الخطة لا يعني بدء بناء الفرونت أو تطبيق الميزات الآن.

خارج النطاق: Stripe Connect، التحويلات البنكية الآلية، live money، سلة متعددة الكورسات، عملات إضافية، محاسبة ضريبية وفواتير آلية وتقارير متقدمة، شهادات أو اختبارات أو chat أو notifications منتجية جديدة. بيانات التجربة لا تُستخدم كأموال حقيقية. أي partial refunds كميزة واجهة تحتاج قرار نطاق؛ لا نتجاهل حدوثها خارجيًا عند reconciliation.

## 4. S3-01: سجل القرارات المطلوبة قبل التنفيذ

كل صف يُوثَّق بصاحب القرار، التاريخ، القيم النهائية، والعقد/الاختبار المتأثر. توصية هندسية ليست موافقة من المستخدم.

| القرار | التوصية المبدئية | ما لا يجوز افتراضه |
| --- | --- | --- |
| Refund policy | استرداد كامل يبدأه admin في Test Mode، بنافذة زمنية واضحة؛ 14 يومًا مقترح للنقاش فقط | لا نافذة 14 يومًا أو منع refund بسبب نسبة تقدم دون موافقة |
| تجاوز السياسة | إن أُجيز، صلاحية صريحة وسبب audited، لا flag عام من العميل | لا bypass تلقائي لقيود المنتج |
| أهلية الأرباح | بعد انقضاء نافذة الاسترداد، دون refund/hold مفتوح | لا payout فوري بمجرد نجاح الدفع |
| إصدار السياسة | policyVersion وeffectiveFrom، وربط كل بيع بسياسة refund/eligibility ثابتة وقت الشراء | لا إعادة حساب تاريخ أهلية مبيعات قديمة من env متغير دون قرار migration صريح |
| التأخر في الاسترداد | بعد paid payout: دين سالب يُخصم من القادم وفق الـMVP | لا محو دين أو تغيير كشف تسوية تاريخي |
| Refund أثناء تحويل يدوي | تجميد كشف التحويل، قيد مشروط وreconciliation قبل التسوية التالية | لا افتراض أن pending يعني الأموال لم تُحوَّل |
| محاضر suspended | وقف تسويات جديدة لحين قرار إداري، دون إسقاط الالتزام المالي | لا منع تسجيل حقيقة تحويل تم بالفعل |
| إعادة الشراء | بعد full refund مؤكد فقط؛ تفعيل نفس Enrollment بشراء جديد إذا سبب revocation هو refund | لا تجاوز admin/legal revocation أو إحياء بيع قديم |
| تقدم عند إعادة الشراء | اقتراح الاحتفاظ بتاريخ التقدم وإعادة حسابه على المحتوى الحالي | سياسة الاحتفاظ/التصفير يجب اعتمادها وتوثيقها |
| تعديل منشور | نسخة حيّة + candidate مستقل للمراجعة؛ allowlist ضيق لتصحيح النص | لا نشر مادة جديدة فورًا أو إغلاق الكورس الحي أثناء المراجعة |
| محتوى جديد بعد الإكمال | نسبة ديناميكية وفق الـMVP، وتحديث دلالة completedAt عند الحاجة | لا نسبة 100% دائمة بعد إضافة درس |
| التسوية الشهرية | حدود شهر تقويمي Africa/Cairo مخزنة UTC، تشمل مستحقات قديمة غير مسوّاة وكل الدين السابق | لا شهر = 30 يومًا، ولا اختيار أرباح موجبة فقط |
| حدود النسخ والتسويات | حد transaction وعدد العناصر يُعتمد بعد قياس بيانات وتجربة أكبر حالة | لا truncate صامت للكورس أو كشف التسوية |
| Readiness الفريق | تثبيت repo/build للفرونت وURLs Staging وowners وبيانات demo ومقاييس الأداء المقبولة | لا اعتبار frontend الفارغ محليًا دليل واجهة جاهزة، ولا اعتماد غياب بيئة كـPASS |
| نافذة الاحتفاظ بالوسائط | تتجاوز مدة الاعتماد الصادر وتسمح بrollback آمن | لا حذف فوري لملف تستخدمه النسخة الحية أو candidate آخر |
| الجدول | زيادة السعة المؤكدة أو تمديد Sprint الإغلاق النهائي مع تحديث موعد التسليم | لا Sprint 4 لإخفاء متطلبات أساسية متبقية، ولا حذف نطاق MVP للحفاظ على موعد شكلي |

المخرجات: ADR للـledger/refund/payout، ADR لتعديل المحتوى المنشور، سجل السياسات، proposed contracts، وأولويات التنفيذ. القرارات التجارية يقرها ممثل المنتج؛ التفاصيل التقنية يضبطها BE1، ويشارك FE1/FE2/FE3 في حالات الواجهة.

Definition of Ready: لا تُعدّ Story مالية/تعديل منشور Ready إذا بقي قرارها مفتوحًا. كل قرار يحمل owner وموعدًا داخل Sprint 3 وبديلًا موصى به؛ عدم حسمه يمنع اعتماد التسليم، وليس مبررًا لتأجيل المتطلب الأساسي. سياسة حقول الملف الأساسي تُحسم كذلك: الاسم والصورة مدعومان جزئيًا حاليًا، وأي حقول إضافية يطلبها المنتج تُحدد قبل S3-18 بلا اختراع بيانات شخصية غير لازمة.

## 5. Clean Architecture وطريقة التنفيذ

- الاستمرار في Node.js 22 LTS / ESM، Express 5 تحت `/api/v1`، Mongoose، Zod فقط، `node:test` + Supertest طبقًا لـADR 0003. لا إدخال Jest أو إعادة بناء المشروع.
- الحفاظ على `src/config`, `models`, `middlewares`, `services`, `utils`, `modules`. Modules مقترحة: `adminUsers`, `refunds`, `earnings`, `payouts`, `adminDashboard`, `courseRevisions`، مع تعديل محدود في modules الحالية.
- Controller يترجم HTTP فقط. Service يملك قواعد الانتقال والصلاحيات؛ provider adapter يتعامل مع Stripe/Mux/Cloudinary؛ presenter يختار DTO. حقن provider وclock وتحديد dependency direction، بلا circular imports أو god service.
- لا repository wrappers شكلية. يمكن استخراج policy/query مشتركة عندما تمنع اختلافًا فعليًا بين library/progress/playback أو refund/payout.
- Zod strict schemas لكل body/params/query/header، normalize متعمد، ObjectId صحيح، limits، enums، تواريخ ونطاقات، ورفض unknown fields. تحقق Mongoose والفهارس يبقى دفاعًا إضافيًا لا بديلًا عن Zod.
- Success `{ "data": {}, "message": "optional" }`، Error `{ "error": { "code": "ERROR_CODE", "message": "Readable message", "details": [] } }`. Errors معرّفة وآمنة؛ لا stack/secret/provider body/DB internals في أي بيئة.
- Transactions لعمليات DB المتلازمة؛ لا اتصال بمزود داخل callback قد يعاد تشغيله. لكل عمل خارج DB reservation + idempotency + reconciliation، لا promise وهمي بأن البنك وMongoDB transaction واحدة.
- كل عملية حساسة تتحقق من المستخدم الحالي وحالته وصلاحياته، لا JWT role قديم وحده. عمليات ماليات/admin عليها `no-store` وrate limit مناسب وaudit.
- Worker متعدد العمليات: leases + fencing + bounded retries/backoff + deadline. عند shutdown تتوقف claims الجديدة، ويمنع العامل القديم الكتابة بعد انتهاء lease؛ cancellation وحده لا يكفي لمنع commit متأخر.
- Logs من حقول allowlisted وerror codes وcorrelation IDs؛ لا auth cookies أو raw webhook أو signed URL أو بيانات بطاقات أو connection strings.

### 5.1 دورة كل Story

1. تثبيت العقد والسياسة والـmigration المطلوبة قبل الكود.
2. Mongoose models/indexes أو توثيق عدم الحاجة لموديل جديد.
3. Zod schemas، services/policies/adapters، controller، routes/middlewares.
4. Unit + HTTP + replica-set integration + concurrent/failure tests بحسب المخاطر.
5. OpenAPI للعمليات المنفّذة فقط، frontend examples، verification، مراجعة diff وتسجيل الدليل.

لا نضيف عمليات الخطة إلى Swagger المتاح الآن كأنها جاهزة. رقم إصدار العقد الجديد يُحدد عند التنفيذ؛ هذا الملف ليس بديلًا عن `openapi.yaml`.

## 6. Data Schema — الرسم، الموجود، والتوسعات المقترحة

### 6.1 قواعد مشتركة وثبات التاريخ

`_id: ObjectId` وtimestamps. FK في الرسم reference منطقي، والخدمة تتحقق منه لأن MongoDB لا يفرض relational FK. مبالغ `EGP` قرش integer؛ حصص كل Order تُقرأ من snapshot لا من سعر الكورس الحالي. `commissionBps=2000` و80/20 كما اعتمد في Sprint 2؛ gateway fees على المنصة، ولا تُطرح من نصيب المحاضر خلسة.

الحساب بوسيط BigInt أو تمثيل exact مناسب، ثم تحويل آمن للـJSON. سلامة مبلغ واحد لا تضمن سلامة aggregate؛ تُجمع القيم بدقة، وتُرفض النتيجة خارج safe integer بخطأ معلوم بدل rounding أو overflow. لا Decimal floating-point عادي للأموال.

السجلات المالية وaudit لا تُحذف بـTTL. provider identifiers hidden افتراضيًا؛ تُعرض المراجع الضرورية فقط للأدمن عبر presenter صريح. لا تخزين بيانات بطاقات أو keys.

policyVersion وشروطها تثبت عند إنشاء Checkout. refundDeadlineAt وeligibleAt يحسبان مرة واحدة عند fulfillment من paidAt الموثوق للمزود، لا من وقت إنشاء Checkout ولا من وقت وصول webhook المتأخر. لا موعد نهائي مصطنع لطلب لم يُدفع، ولا تقصير حق الاسترداد لأن الدفع تم بعد إنشاء الجلسة بمدة. retry يحافظ على النتائج نفسها، وتغيير السياسة لاحقًا لا يبدلها.

### 6.2 الكيانات الأساسية من الرسم

| الكيان | الموجود / التغيير المطلوب |
| --- | --- |
| User | `status: active/suspended` موجود؛ إضافة transition metadata/audit وguard إداري. لا instructorStatus=suspended جديد؛ التعليق على الحساب نفسه |
| Category / InstructorApplication / AuthToken | موجودة؛ regression والحفاظ على التاريخ والفهارس فقط |
| Course | إضافة `archived` مع archivedAt/by/reason؛ `unavailable` الحالي لعطل محتوى ليس مرادفًا للأرشفة. إضافة revision linkage و`accessStatus: available/blocked` مع سبب وactor/date مستقلين لتطبيق BR09 |
| Section / Lesson / MediaAsset | تبقى النسخة الحية؛ ربط سياق وسائط candidate وفصل webhooks والتنظيف عنها |
| Order | snapshot ثابت مع refundPolicyVersion/refundDeadlineAt وeligibility policy linkage؛ refunded فقط عند full refund ناجح. الحفاظ على purchaseSlotActive unique جزئي ومنع تحريره أثناء refund غير محسوم |
| Payment | ربط Refund دون تعديل مبلغ البيع؛ source provider truth وحالات نهائية محمية |
| Enrollment | نفس unique(studentId,courseId)؛ revocationReason وsourceOrderId الحالي يحميان من refund قديم. التاريخ محفوظ |
| LessonProgress | unique(enrollmentId,lessonId) محفوظ؛ stable Lesson IDs وإعادة حساب المحتوى الحالي |
| WebhookEvent | توسيع payload discriminator للـrefund وأحداثه، دون كسر Checkout parser أو إنشاء inbox موازٍ |
| EarningEntry | نموذج موجود: sale/refund_adjustment، signed amount، pending/eligible/included_in_payout/reversed. eligibleAt ثابت مشتق من policy snapshot؛ hold/dependency linkage مقترح دون تغيير snapshot المالي |

### 6.3 Refund — موديل جديد من الرسم

حقول الرسم: `paymentId`, `providerRefundId`, `idempotencyKey`, `amountMinor`, `currency`, `status`, `reason`, `initiatedBy`, `completedAt`.

توسعات مبررة: `orderId` للبحث، provider، source=admin/provider، requestFingerprint وsnapshot طلب immutable، providerIdempotencyKey مستقل يصدره السيرفر ويحفظه قبل الشبكة، `leaseOwner/leaseUntil/leaseVersion`, `attempts/nextAttemptAt`, sanitized failureCode، وprovider status/lastReconciledAt. الحالات المحلية المقترحة: `requested`, `processing`, `pending`, `succeeded`, `failed`, `cancelled`, `requires_reconciliation`؛ تُثبت في S3-01 مع mapping لـStripe `canceled` و`requires_action`.

فهارس:

- Unique `(provider, providerRefundId)` بpartial filter على string موجود، لا unique null لكل refund لم يُرسل بعد.
- Unique جزئي `(initiatedBy, idempotencyKey)` للطلبات المحلية حيث initiatedBy ObjectId وkey string موجودان؛ نفس key ونفس fingerprint يرجع نفس العملية، payload مختلف → 409. السجل الخارجي لا يدخل هذا الفهرس بقيم null/مفقودة فيمنع تسجيل refunds أخرى بالخطأ.
- Unique جزئي `(provider, providerIdempotencyKey)` عند وجود key؛ key مشتق بهوية العملية المحلية أو UUID مستقل، وليس قيمة header الخام المشتركة بين أدمنين. يحتفظ به لكل retry، فلا تتصادم عمليات مستقلة عند المزود.
- Unique جزئي `(paymentId)` للعملية الكاملة النشطة؛ لا full refunds متوازية. فشل نهائي موثوق يسمح بمحاولة جديدة حسب السياسة.
- `(status,nextAttemptAt,leaseUntil)` للـworker، و`(orderId,createdAt,_id)` للقراءة.

عمليات خارجة من Dashboard المزود تسجَّل أيضًا بهوية provider فريدة و`initiatedBy=null` مع source=provider، لا admin وهمي. Provider يعيد مبالغ أصغر؟ تُحفظ الحقيقة وتفتح reconciliation؛ لا تُزوّر full refund.

event-before-response يُربط بـRefund المحجوز من server-generated metadata ثم provider identity؛ لا ينشئ سجلًا خارجيًا ثانيًا لنفس الطلب المحلي. إذا لم يمكن التحقق من العلاقة، يُحفظ الحدث ويُرفع reconciliation hold بدل تخمين علاقة أو دمج سجلات مالية.

### 6.4 Payout — موديل جديد من الرسم

حقول الرسم: `instructorId`, `amountMinor`, `currency`, `status`, `transferReference`, `createdBy`, `paidBy`, `paidAt`.

توسعات: periodStart/periodEnd UTC، cutoffAt، idempotencyKey/fingerprint، sealedAt/by، transferAttemptId، transferMethod، cancellation metadata، revision. `amountMinor>0` ومجموع العناصر يساويه. الحالات `draft → pending → paid` أو `cancelled` بقيود الانتقال أدناه؛ pending يحتاج resolution metadata لنتيجة unknown، لا expiry يلغي تحويلًا محتملًا.

فهارس: `(instructorId,createdAt,_id)`، unique `(createdBy,idempotencyKey)`، unique جزئي للمحاضر مع payout نشط طبقًا لقاعدة تسوية واحدة فعالة، وunique جزئي `(transferMethod,transferReference)` للقيم الفعلية. المرجع يُطبع/ينظَّف وفق نوع التحويل قبل uniqueness؛ لا bank credentials في السجل.

### 6.5 توسعات خارج الرسم لتأمين التاريخ والتزامن

| الكيان المقترح | السبب والحد الأدنى / الفهارس |
| --- | --- |
| PayoutItem | تاريخ immutable لكل earning حُجز في payout: payoutId/earningEntryId/amountMinor/type/currency. Unique(payoutId,earningEntryId)، index earningEntryId. إلغاء payout لا يمحو كشفه؛ لا arrays مالية غير محدودة داخل Payout |
| InstructorFinanceState | سجل واحد unique(instructorId)، revision وhold reasons وحالة التحويل. كل refund/eligibility/reservation/cancel/paid يكتب نفس السجل داخل transaction لتسلسل القرار عبر processes |
| AdminAuditEvent | actorId/action/targetType/targetId/allowed before-after/reason/requestId/time. Index(targetType,targetId,createdAt) و(actorId,createdAt). Append-only؛ لا raw bodies أو أسرار |
| AdminSecurityState | singleton unique key، revision لحماية آخر admin نشط تحت التزامن. كل تعليق/تغيير صلاحية admin يشارك نفس guard |
| FinancialPolicyVersion | إصدار immutable مع effectiveFrom/refund window/eligibility rule/approvedBy/approvedAt؛ unique(version). Order يثبت policy/deadline المعمول بهما عند الشراء، وlegacy backfill له mapping معتمد لا تخمين |
| CourseRevision | courseId/number/baseContentRevision/status/submittedAt/reviewer/reason + bounded metadata snapshot؛ unique(courseId,number) وunique جزئي لـcandidate نشط واحد |
| RevisionSection / RevisionLesson | curriculum candidate normalized؛ stable logical IDs + position/content/media references. Unique(revisionId,logicalId) وunique position ضمن الأب؛ لا full curriculum array غير محدودة |

هذه اقتراحات تصميم تُعتمد بـADR، لا claims بأنها كانت في الرسم أو أنها منفّذة. `PayoutItem` يسمح بنفس earning في كشف ملغى ثم كشف لاحق، بينما active claim يُضبط ذريًا على EarningEntry + finance state؛ لذلك لا global unique(earningEntryId) يمنع إعادة الحجز المشروع.

إنشاء finance/security singleton آمن تحت التزامن بفهرس unique ومعالجة duplicate-write retry؛ كل مسار مالي يشارك نفس guard، لا بعض المسارات فقط. holds كثيرة تحتاج rows مستقلة مفهرسة بمعرف مصدر unique بدل قائمة متنامية داخل مستند المحاضر. الغرض من guards تسلسل القرار، لا تخزين ledger كامل فيها.

### 6.6 Migration إلزامية

- Dry-run يكتشف duplicate identifiers وunsafe amounts وorphan references والمستحقات القديمة بلا eligibleAt؛ لا حذف أو تخمين الماليات.
- Backfill eligibleAt من paidAt + policyVersion المعتمد لتلك المبيعات، لا createdAt أو تاريخ تشغيل script أو آخر env value. المبيعات السابقة بلا نسخة سياسة تحتاج mapping مؤرخًا يوافق عليه المنتج؛ غير المحسوم يبقى hold ولا يصبح eligible تلقائيًا.
- Earning snapshots القديمة تُطابق Order قبل eligibility؛ الاختلاف hold + تقرير، لا تعديل المبلغ لتغطية الخطأ.
- إنشاء الفهارس بعد فحص البيانات، دون syncIndexes إسقاطًا تلقائيًا لفهارس قديمة. نسخة احتياطية وتقرير counts ومراجعة؛ run مرتين لا يغير النتيجة.
- تشغيل replicas/transactions حقيقي في الاختبارات. توثيق تأثير نشر schema ثم workers ثم endpoints، وإمكانية العودة لإصدار لا يعرف archived/revisions؛ rollback ثنائي للكود وحده قد لا يكون آمنًا.

## 7. سياسات الماليات والحالات الحرجة

### 7.1 الاسترداد والـprovider truth

1. التحقق من admin الحالي، order paid، policy، currency/amount من snapshot، وغياب عملية refund غير محسومة.
2. حجز Refund محلي وhold مالي داخل transaction، ثم إرسال طلب Stripe خارجها بمفتاح providerIdempotencyKey المحفوظ والمستقل عن header العميل وmetadata غير سرية تربط المحاولة بسجلها المحلي.
3. HTTP 202 يعني قُبل الطلب محليًا، وليس أن الأموال عادت. حتى provider response قد يكون pending؛ access لا يُلغى فور الضغط.
4. timeout/network ambiguity لا يعني failed ولا يسمح بطلب refund ثانٍ. recover بالقراءة الموثوقة من المزود ومعرّف المحاولة.
5. توسيع `/api/v1/webhooks/stripe` الحالي بأحداث `refund.created`, `refund.updated`, `refund.failed`، ومعالجة `charge.refunded` للمطابقة عند تفعيلها. Raw-body verification قبل parsing، durable insert قبل acknowledgment، duplicate/out-of-order safe.
6. نجاح full refund المؤكد يُطبَّق مرة واحدة في transaction: Refund succeeded، Order/Payment refunded، تحرير purchase slot، إلغاء الوصول للـEnrollment المطابق sourceOrderId، أثر الـledger/audit، وتعليم inbox processed. crash قبل/بعد commit لا يضاعف الأثر.
7. Failure/cancellation المؤكدان يرفعان hold الخاص بهذه العملية فقط؛ لا يزيلان holds أخرى ولا يعيدان course/account status.

Stripe idempotency keys يمكن حذفها بعد 24 ساعة؛ لذلك reconciliation لعملية مجهولة قديمة يجب أن يبحث لدى المزود باستخدام payment/refund identity وmetadata مع pagination محدودة وتصعيد عند عدم الحسم، ولا يعيد الإرسال عميانيًا بنفس key. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

Stripe يدعم full/partial وتوجد حالات pending/requires_action/failed/canceled؛ ربطنا بالنجاح يحتاج الحالة الفعلية لا مجرد إنشاء Refund. [Refund object](https://docs.stripe.com/api/refunds/object)، [Refunds](https://docs.stripe.com/refunds).

External partial refund أو dispute خارج contract المختار: حفظ الحدث والحقيقة، hold على المبالغ المعنية، alert وreconciliation موثق؛ لا تجاهله ثم دفع ربح كامل، ولا اعتباره full refund وإلغاء وصول/فتح إعادة شراء بلا قرار. دعم feature كاملة له يتطلب story تغيير نطاق، لكن safety hold جزء من التشغيل.

### 7.2 Refund مقابل Payout

| وضع أصل البيع عند full refund | المعالجة المطلوبة |
| --- | --- |
| pending/eligible غير محجوز | sale → reversed؛ لا negative adjustment إضافي يخصم مرتين |
| محجوز في draft، لم يُسمح بتحويل خارجي | إلغاء draft ذريًا، حفظ PayoutItems، فك حجز بقية العناصر، وعكس البيع المسترد؛ يلزم إعادة بناء كشف جديد |
| داخل pending sealed أو نتيجة التحويل unknown | لا تغيير amount/lines أو إطلاق الحجز؛ إنشاء negative adjustment واحد مشروط بـdependentOnPayoutId، وhold يمنع payout تالٍ إلى أن تُحسم النتيجة |
| الـpending السابق تأكد paid | الإبقاء على الكشف الأصلي، وتحويل adjustment إلى دين eligible للتسوية التالية |
| الـpending السابق تأكد not sent ثم cancelled | عكس sale المسترد، وعكس adjustment المشروط حتى لا يخصم ثانية؛ فك حجز بقية العناصر |
| سبق paid | كشف paid لا يتغير؛ adjustment بقيمة سالب instructorAmountMinor الأصلي، unique refundId، يدخل التسوية القادمة |

كل صف يختبر بـtransactions متزامنة على نفس finance state. القاعدة الوسطية الخاصة بالتحويل الجاري تُعتمد في S3-01 لأنها توضح منطقة غير مفصلة في الرسم. إذا تعذر حسم تحويل، يبقى hold ويُعرض للمشغّل، ولا تُسامح الديون أو تُحرَّر الحجوزات بالوقت.

### 7.3 أهلية الأرباح والتسوية

- eligibleAt مشتق من paidAt والسياسة المثبتة للبيع؛ worker لا يقرأ إعدادًا جديدًا ليقدّم أهلية بيع قديم أو يغيّر نافذة استرداده. إصدار سياسة جديد يطبق على مشتريات جديدة؛ أي معالجة retroactive تحتاج قرارًا وأثرًا موثقين. worker يحوّل eligible فقط عند غياب refund/hold وأن أصل البيع لم يُعكس.
- كشف الشهر يشمل كل المستحق غير المسوّى حتى cutoff، بما فيه carry-forward والقيود السالبة الأقدم. لا filter periodStart يُخفي الدين أو القديم.
- احتساب net قبل الحجز. net≤0 → لا تحويل؛ الدين يبقى ظاهرًا للقادم، لا يسقط لأن المبلغ النهائي صفر.
- حجز ذري للعناصر eligible وغير المحجوزة مع Payout/PayoutItems ومجموع exact. نفس المبلغ أو IDs من body ليست مصدر الحقيقة؛ لا يسمح باختيار الموجب فقط.
- حجم الكشف محدود ومقاس. إذا تجاوز حدود المعاملة مع احتمال إخفاء سالب، يرجع خطأ capacity واضح وخطة batch/partition معتمدة؛ لا اقتطاع أول N عنصر وتحويل مبلغ خطأ.
- تحويل draft إلى pending يحكم amount/items ويحدد responsible operator وtransferAttemptId قبل الخروج للبنك. لا تُعدّل النسخة المختومة بعد ذلك.
- mark-paid يسجل حقيقة تحويل مرجعه معلوم ومطابق للمبلغ؛ تكرار نفس الطلب يرجع نفس النتيجة، مرجع/مبلغ متعارض → 409.
- draft يمكن إلغاؤه. pending لا يُلغى إلا بإثبات أن التحويل لم يحدث؛ unknown يمنع المحاولة الجديدة ويستلزم reconcile. لا worker ينقل المال، ولا وعد exactly-once في بنك يدوي.
- paid نهائي؛ تغيير المستخدم/السعر/الأرشفة لا يغيّر الماليات التاريخية. لا API يعدل ledger amounts أو paid payout.

### 7.4 عرض المبالغ دون التباس

Contract يفرّق بين grossSales، successfulRefunds، netSales، platformCommissionNet، instructorEarnedNet، pending، eligibleAvailable، reserved، paidPayouts، negativeCarry وholds. كل مبلغ مع currency، range UTC وasOf وتعريف حسابه؛ لا لفظ earnings لمجموع المبيعات أو payout لمبلغ sale.

الـsale reversed لا يجتمع مع خصم adjustment لنفس الأثر. original paid sale + successful adjustment يحتسب صافيًا مرة واحدة. PayoutItems في كشف cancelled لا تُحتسب paid. Gateway fees ليست ممثلة كربح صافٍ محاسبي في dashboard؛ commission ليست net profit.

## 8. المستخدمون والأرشفة والتعديل المنشور

### 8.1 إدارة المستخدمين

Admin list/search/read وactive↔suspended مع reason. تعليق الحساب يمنع login/actions وفق Auth policy ويزيد tokenVersion ويلغي refresh sessions عند الحاجة. مراجعة race بين تعليق المستخدم وcheckout/media/refund؛ تسجيل حدث مزود يؤكد بيعًا حقيقيًا لا يُلغى لأن المحاضر عُلّق بعد دفع الطالب.

منع self-suspension المضر وآخر admin نشط. count ثم update ليس ضمانًا تحت التزامن؛ transaction تشارك AdminSecurityState عند أي مسار قد يقلل active admins. لا hard delete لبيانات صاحب سجل مالي، ولا تغيير roles عبر body إدارة الحالة. التعليق لا يصادر أرباحًا أو يمحو enrollment/history؛ العودة active لا تعيد refresh tokens القديمة.

### 8.2 سياسة وصول مشتركة

| حالة الكورس / الطالب | Catalog / preview / شراء جديد | Library / playback / PDF / progress للملتحق |
| --- | --- | --- |
| published + active enrollment + active user | وفق السياسات الحالية | مسموح إذا الوسيط جاهز وغير blocked |
| archived + active enrollment + active user | مخفي؛ ممنوع شراء/التحاق وpublic preview جديد | مسموح للمشترين الحاليين وفق BR09 |
| unavailable أو explicit legal/security block | ممنوع | مرفوض بسبب واضح؛ لا مساواة بالأرشفة |
| full refunded source order أو user suspended | لا استخدام privileged bypass | مرفوض؛ التاريخ يظل للعرض المسموح |

تطبيق السياسة نفسها في library details/progress/lesson credential/download/free enrollment/Checkout وwebhooks المرتبطة، لا تغيير شرط واحد فقط. الأرشفة تتسلسل مع Checkout reservation؛ بيع بدأ قبل الأرشفة ودُفع حقيقةً تُحترم نتيجته وفق snapshot، ولا يُترك paid دون enrollment. المحاولات الجديدة بعد الأرشفة تُرفض.

الـcredential الصادر قد يبقى صالحًا حتى expiry؛ لا وعد بإبطال URL محمّل فورًا إذا المزود لا يدعمه. fresh checks تمنع إصدار جديد، وتوثّق مدة التعرض واختبارها. legal/security block يستخدم metadata/policy منفصلة؛ إن احتاج تعطيل asset لدى المزود يُنفذ بإجراء موثق لا بمجرد status archived.

### 8.3 إعادة الشراء بعد full refund

Enrollment unique للطالب والكورس يبقى. fulfillment الجديد يعيد تفعيله ذريًا ويغيّر sourceOrderId فقط إذا revoked بسبب refund مؤكد؛ لا يتجاوز block مستقل. webhook قديم لـrefund لا يلغيه لأن مصدره مختلف. retry لبيع جديد لا يكرر enrollment أو earning. لو أصبح الكورس مجانيًا، تُحدَّد سياسة reactivation للـfree enrollment أيضًا، بدل special case مخفي.

### 8.4 تعديل منشور معزول

- تصحيح نص محدود عبر allowlist مع audit وoptimistic revision check. الوصف يُراجع للتأكد أنه تصحيح لا تغيير موضوعي؛ لا escape hatch يبدّل promises للمشتري بلا مراجعة.
- price/category/cover/curriculum/video/PDF وأي تغيير مادي في candidate فقط. price الجديد يؤثر في Checkout الجديد بعد approval، لا orders القائمة.
- تصميم مقترح: CourseRevision + normalized candidate sections/lessons، مع live Course/Section/Lesson الحالية. عند approval تُطبَّق تغييرات محدودة ذريًا وتُحفظ هوية الدروس والتاريخ؛ أثناء review تبقى الحية published.
- readiness يعاد التحقق منه لحظة approval: category نشطة، media authenticated/signed وready، الملكية، curriculum كامل، وbase revision لم يتغير. stale base → conflict، لا last-write-wins.
- logicalLessonId ثابت للدرس المستمر؛ الجديد له ID جديد. حذف درس من النسخة الجديدة لا يمحو progress/orderhistory؛ archived lesson metadata تحفظ للمراجعة، ولا يدخل denominator الحالي.
- Mux webhook/upload attempts تحمل revision context؛ ready لـcandidate لا يكتب asset/status للدرس الحي. حذف/فشل asset حي يفعل availability policy؛ draft asset لا يسقط الكورس الحي.
- تنسيق transactions يجب أن يبقى bounded. اقتراح حد 200 درس إجمالي يُدرس في ADR ولا يُفرض كحقيقة حالية؛ الكورسات القديمة الكبيرة تبقى قابلة للقراءة، والتعديل الكبير يحتاج مسارًا مصممًا بدل truncation أو نشر جزئي.
- لا حذف media referenced بالحياة/candidate/rollback قبل انتهاء retention واعتمادات الوسائط. حصر orphan cleanup على refs الفعلية، والـlease/fencing يمنع عامل قديم من حذف asset أُعيد ربطه.

هذا تصميم قابل للمراجعة لا rewrite شامل. إذا القياس لا يسمح بنشر transaction محدود، تُعتمد immutable version pointer بدل ذلك قبل التنفيذ، مع migration للقراءات واختبارات توافق؛ لا يخلط الفريق التصميمين عشوائيًا.

## 9. الـStories بالترتيب — مخرجات ومعايير قبول

كل Story تشمل خطوات §5.1. التقدير يشمل اختبارات المطور وتحديث العقد، لا يعد بأن الإنتاج بلا أي عيوب. اعتماد السياسة شرط بدء للـStories التابعة لها.

### S3-01 — السياسات والعقود وBaseline readiness (3–4 ساعات)

- Models: مراجعة schema الحالي والتوسعات فقط؛ Zod/controllers/routes: proposed contracts لا endpoints وهمية؛ utils/services: ADR وحدود وتعاريف الماليات.
- تحديث سجل §4، capacity decision، وcarry-in A01–A19 مع Owners. رسم انتقالات refund/payout/revision ومطابقة Product rules.
- قبول: كل policy المؤثرة في المال والوصول معتمدة أو محددة كblocker قبل تنفيذها، لا default تجاري صامت. FE1/FE2/FE3 يراجعون حالات الواجهة.
- تحقق: baseline verify فعلي، مراجعة كل path/role/error، وموافقة مؤرخة على ADR والسياسات.

### S3-02 — Financial foundation والفهارس والتدقيق (4–6 ساعات)

- Models/indexes: Refund/Payout/PayoutItem/InstructorFinanceState/AdminAuditEvent/FinancialPolicyVersion؛ تعديلات Order/EarningEntry/Enrollment المحدودة. Zod primitives للأموال وIDs والـidempotency.
- Services/utils: ledger transition policies وexact money totals وaudit؛ لا public controller جديد يلزم لهذه البنية.
- قبول: snapshots immutable، references قابلة للتحقق، partial indexes صحيحة، لا تضاعف sale/refund/active claims.
- اختبارات: duplicate-key races، invalid signs/currencies، safe total overflow، immutable fields، transaction rollback، dry-run على سجل قديم.

### S3-03 — Admin users وتعليق الحساب بأمان (4–6 ساعات)

- Models: User metadata + AdminSecurityState/audit. Zod: list filters/search/cursor وstatus/reason/revision. Controllers/routes: admin users read/status فقط.
- Services/middlewares: fresh admin auth، guard آخر admin، session invalidation، noStore/rate limits؛ لا mass-assignment للـroles.
- قبول: التعليق نافذ على الأفعال الجديدة، التاريخ والأموال محفوظان؛ حسابان admin لا يعلقان بعضهما ويتركان المنصة بلا admin.
- اختبارات: concurrent last-admin، self-action policy، role injection، suspended requester، stale JWT، إعادة التفعيل لا تعيد جلسة ملغاة.

### S3-04 — Course archive والوصول للمشترين (4–6 ساعات)

- Models: archived enum/metadata وaccess block مستقلة؛ index لقراءات الحالة. Zod: courseId/reason/expectedRevision وaccessStatus allowlist.
- Controllers/routes: admin archive وblock/unblock policy؛ Services: shared course access policy وتحديث catalog/Checkout/enrollments/learning/progress كافة. فك block لا ينشر archived/unavailable تلقائيًا.
- قبول: archived لا يظهر ولا يُشترى جديدًا، والمشتري النشط يستمر؛ لا كشف private media بالـpublic preview ولا hard delete.
- اختبارات: archive ضد Checkout متزامن، existing buyer playback/PDF/progress، unavailable/legal block، suspended student، owner/admin review bypass مضبوط.

### S3-05 — طلب Refund محفوظ وStripe adapter (6–8 ساعات)

- Models: Refund + financial hold. Zod: reason، orderId، Idempotency-Key؛ لا client amount/status. Controllers/routes: create/list/read admin refunds.
- Services: reserve قبل الشبكة، immutable fingerprint، provider refund adapter وتحديد error mapping/reconciliation identity.
- قبول: 202 يعني accepted؛ provider pending/timeout محفوظان، replay يعيد نفس العملية، conflict لا يرسل طلبًا ثانيًا.
- اختبارات: full amount/policy snapshot، expired window، failed/cancelled order، own-role violation، two parallel admins، نفس header key لأدمنين على عمليتين مختلفتين لا يصطدم لدى المزود، multiple external refunds بلا null-index collision، timeout بعد provider create، نفس key/body مختلف.

### S3-06 — Refund events والـledger recovery (7–10 ساعات)

- Models: WebhookEvent refund discriminator وRefund state/fencing؛ Zod trusted normalized event schemas. Controller/route: توسيع Stripe webhook الحالي فقط.
- Services: refund fulfillment/reconciliation worker، transition table §7.2؛ shutdown bounded والمزود خارج transactions.
- قبول: full success يتلازم ماليًا مع access/slot، duplicates/out-of-order لا تغيّر الحقيقة؛ external partial/unknown يُحجز ويُبلّغ، لا lost money.
- اختبارات: wrong signature/raw body، event-before-response، crash قبل/بعد commit، concurrent payout، stale worker، 24h unknown retry، failure بعد success، provider outage وpartial external.

### S3-07 — Access after refund وإعادة الشراء (4–6 ساعات)

- Models: Enrollment revocation reason/sourceOrder fences؛ الزود/Controllers/routes: تحديث contracts الموجودة للطلبات/library/free enroll، لا endpoint لإجبار reactivation.
- Services: payment fulfillment يعيد تفعيل Enrollment المسموح ويحمي الطلب الجديد من refund قديم؛ progress policy حسب القرار.
- قبول: refund ناجح يمنع credentials الجديدة، وإعادة شراء صحيحة تعمل مرة واحدة، وadmin/legal revoked لا يتجاوزها شراء.
- اختبارات: delayed old refund بعد purchase جديد، two parallel repurchases، idempotent fulfillment، now-free course، retained progress/current denominator، failed refund لا يقطع الوصول.

### S3-08 — Eligibility worker وholds/carry-forward (5–7 ساعات)

- Models/indexes: eligibleAt/hold linkage وworker query indexes؛ Zod config للسياسات المعتمدة لا أرقام hardcoded. لا HTTP controller إلزامي للـjob؛ تشغيل CLI إداري موثق إذا لزم.
- Services: dated eligibility/backfill، instructor finance serialization، bounded claims واستمرار بعد restart.
- قبول: لا eligible قبل الحد أو أثناء refund/transfer hold؛ دين سابق يظهر، ولا تُعدّل snapshots؛ timezone boundary متسق.
- اختبارات: exact boundary، legacy paidAt/policy mapping، تغيير إصدار السياسة لا يغير deadline/eligibility قديمين، delayed webhook لا يؤخر/يقصر النافذة، worker duplication/crash، refund يبدأ عند نفس لحظة الأهلية، suspended instructor، pending adjustment dependency.

### S3-09 — Payout draft وحجز العناصر الصافي (6–8 ساعات)

- Models: Payout/PayoutItems/finance state؛ Zod: instructorId/period/cutoff/idempotency دون client amount أو line selection.
- Controllers/routes: eligible summary + create/read/list draft. Service يحسب ويحجز العناصر في transaction من نفس snapshot.
- قبول: دين قديم يُخصم ولو خارج period، واحد active فقط، مبلغ exact ثابت، net≤0 لا ينشئ تحويلًا، capacity لا يخفي negative lines.
- اختبارات: overlapping requests/months، two admins، zero/negative net، refunded sale، key conflict، interrupted transaction، excess line limit، snapshot total overflow.

### S3-10 — ختم Payout وPaid/Cancel/Reconcile (6–8 ساعات)

- Models: sealed/attempt/reference/audit metadata. Zod: expectedRevision، reason، transferMethod/reference/confirmedAmount؛ no unchecked external outcome.
- Controllers/routes: submit/cancel/mark-paid/reconcile بأذونات admin؛ Services: state table وfencing مع refunds، لا API تحويل بنك.
- قبول: pending ثابت، unknown لا يُلغى آليًا أو يكرر transfer، paid لا يتراجع؛ المرجع متفرّد ومطابق للقيمة. Simulation واضحة في Test Mode.
- اختبارات: two mark-paid، same/different references، refund عند seal/paid/cancel، unknown outcome/restart، no-transfer confirmed resolution، paid write من admin أصبح suspended.

### S3-11 — Instructor sales/earnings/payout history (4–6 ساعات)

- Models/indexes: query indexes حسب explain، دون duplicate ledger. Zod: date/currency/cursor/status allowlists.
- Controllers/routes: own summary/sales/earnings/payout history/detail. Services/presenters: exact totals وaggregation definitions §7.4.
- قبول: INS09/10؛ كل instructor يرى بياناته فقط، debts/holds واضحة، لا بيانات طالب شخصية غير مطلوبة أو provider secrets.
- اختبارات: cross-instructor IDs، negative carry، reversed/cancelled visibility، stable pagination مع تساوي timestamps، totals مقابل ledger، range boundaries.

### S3-12 — Admin dashboard وبيانات الطلب المالية (4–6 ساعات)

- Models: existing User/Course/Order/Payment/EarningEntry/Refund/Payout؛ indexes بعد قياس. Zod: range/filters/cursor محدود.
- Controllers/routes: dashboard + earnings summary، توسيع admin order detail الحالي بـgateway transaction references وrefund history الآمن.
- قبول: ADM07/08/10؛ users/courses/status counts وgross/refund/net/commission/paid/holds بتعريف لا لبس فيه، ليست advanced accounting.
- اختبارات: aggregation لا تضاعف Order عبر joins، free enrollment لا يُحسب sale، exact integer totals، redaction، bounds/invalid ranges، استجابة محدودة ومقاسة.

### S3-13 — Candidate revisions وتعديل المنشور (6–8 ساعات)

- Models: CourseRevision/RevisionSection/RevisionLesson؛ indexes active candidate وpositions/logical IDs. Zod: metadata/curriculum patches وrevision preconditions.
- Controllers/routes: create/read/edit candidate وعمليات curriculum/media لها، simple corrections allowlist؛ owner/instructor middleware.
- Services: candidate مستقل، snapshot bounded، copy/reference policy، no live mutation، fresh ownership. تصميم ADR يسبق الكود.
- قبول: live course لا يتغير أثناء تعديل candidate؛ IDs مستقرة، draft media لا يضرب live asset، نشر مباشر price/content مرفوض.
- اختبارات: parallel candidate creates، stale patch، instructor غير مالك، suspended writer، material field في corrections، oversized legacy curriculum محفوظ دون truncate.

### S3-14 — Revision review/apply وتوافق media/progress (8–12 ساعة)

- Models: revision decisions/history + live revision counters؛ Zod: submit/approve/reject/reason/base revision. Controllers/routes: instructor submit/admin review.
- Services: readiness recheck ونشر ذري bounded، Mux revision-aware routing، retained media cleanup، dynamic progress وإبطال caches المناسبة.
- قبول: old live stays أثناء pending/rejected؛ approval لا نصف curriculum ولا lost history؛ price يؤثر في checkout الجديد فقط، pending order يستعمل snapshotه.
- اختبارات: approval مقابل media failure/category deactivation/archive، two reviewers، stale base، rollback atomic، new/deleted lessons وcompletedAt، delayed candidate webhook، old credential/media retention.

### S3-15 — Migrations والمراقبة والنسخ والاستعادة (6–8 ساعات)

- Models/config: indexes/leases/health metrics لا endpoints عامة حساسة. Zod: env/job limits وCLI args؛ Services/utils: dry-run/apply/reconcile وsanitized operational reports.
- توثيق runbooks لrefund unknown/transfer unknown/backlog/index rollout/rollback/backup restore؛ الفصل بين readiness ولiveness.
- قبول: migration idempotent، restore في DB معزول ومطابقة counts/snapshots، stop/start لا فقد ولا double claim، secrets لا تدخل Git أو evidence.
- اختبارات: migration interrupted/resumed، unsupported legacy rows held، worker drain deadline/fencing، replica-set outage، restore reconciliation مع حقيقة Stripe حتى لا يُسترد/يُسوّى ثانية من backup قديم.

### S3-16 — Staging failure matrix والتكامل الحقيقي (6–10 ساعات)

- Models/routes: لا feature جديدة لمجرد الاختبار؛ تجهيز بيانات منفصلة وثلاثة أدوار دون patch يدوي لحالات readiness/paid.
- أدوات اختبارات وfixtures/runbooks وفق الموافقات؛ provider Test Mode ووسائط حقيقية وواجهة الفريق وingress الحقيقي.
- قبول: إغلاق A01–A19 والحالات B01–B21 أدناه بدليل sanitized، الأخطاء المهمة لها fixes/regression ثم إعادة الاختبار؛ NOT RUN ليست PASS.
- تحقق: refunds الفعلية وduplicate events وconcurrent settlement، media expiry، mobile/network، logs/alerts/restore/rollback. التحويل اليدوي محاكاة لا أموال حقيقية.

### S3-17 — Documentation وFrontend handoff وFinal demo (4–6 ساعات)

- Models: لا جديد. Zod/routes/controllers: contract coverage مقارنة بالموجود؛ Swagger labels وREADME وأمثلة DTO/error/state وتجربة permissions.
- وثائق policy/runbooks وsecrets placeholders وdecision log؛ demo end-to-end للأدوار الثلاثة وحالات failure/refund/archive/revision/payout.
- قبول: OpenAPI صالح ويطابق endpoints الفعلية، no guessed production readiness، كل deferred decision أو known limitation لها owner وخطة.
- تحقق: `npm run verify` النهائي، smoke on deployed candidate، frontend sign-off لكل role، delivery checklist موثق.

### S3-18 — إغلاق نواقص Features القديمة وعرض البروفايل/التفاصيل (6–10 ساعات)

- Models/indexes: إعادة استخدام User/MediaAsset/Course/Section/Lesson؛ لا موديل جديد لمجرد عرض الصورة أو counts. أي حقول ملف أساسي إضافية تعتمد في S3-01 فقط.
- Zod/controllers/routes: تحديث `/users/me` و`/instructors/:instructorId` بعقد `avatarUrl` safe nullable مع استمرار avatarAssetId للتوافق؛ تحديث course-details DTO بـsectionCount/lessonCount/totalDurationSeconds محسوبة من النسخة المعروضة. لا يرسل العميل URL أو provider ID لربطه بحساب آخر.
- Services/presenters: resolve لصورة ready/المملوكة عبر media adapter، من دون استنتاج URL من ObjectId أو كشف secret؛ batch queries بلا N+1. duration من القيم الصحيحة المؤكدة، ووضع unknownDurationCount عند نقصها بدل تقدير مضلل. null صورة/مدة لها fallback موثق للفرونت.
- إكمال أي نقص أساسي يكشفه سجل §17، بما فيه account/avatar UX contract، reasons/resubmission، categories، curriculum، catalog/preview، library/orders/progress. النقص يُحول subtask واضحة في Sprint 3 وتُعاد تقدير ساعاته؛ هذه Story لا تسمح بتغييرات غير محدودة أو ميزات خارج الـMVP.
- قبول: STU03 وتفاصيل §6.1 تعمل بواجهة فعلية دون تركيب private identifiers يدويًا؛ متطلبات سابقة لها دليل فعلية، لا افتراض أنها Done لأنها من Sprint قديم.
- اختبارات: avatar upload/confirm/read/replace/delete/ownership، suspended account/public instructor privacy، missing/stale asset، counts/duration بعد review/revision، pagination/filter/search العربية والإنجليزية، free/paid/preview، lastLesson resume ونسبة 0/100%؛ جميع findings لها regression.

### S3-19 — Final security/privacy/performance وRegression شامل (6–10 ساعات)

- Models/indexes/config: تحسين مبرر بقياس/فحص، لا rewrite. Zod/controllers/routes/middlewares: منع mass assignment/NoSQL injection وoversized requests، authorization fresh وerror redaction، CORS/cookie/CSRF وفق نمط auth الحالي.
- Services/utils: traceable security regression لكل role/entity/ownership؛ dependencies/secret scan وstructured log inspection، pagination bounded واستعلامات explain وmetrics لا تكشف بيانات.
- قبول: JWT قصير وbcrypt≥10 وopaque refresh HttpOnly، settings آمنة على HTTPS الحقيقي، منع refresh cross-origin غير المسموح دون كسر الفرونت المصرح. عدم وجود tokens/provider secrets في browser bundle أو cache أو URLs/logs غير لازمة.
- الاختبارات: anonymous/student/instructor/admin/suspended على الموارد الحساسة، forged/stale JWT، refresh replay/expiry/reset/logout، malformed JSON/Zod/duplicate-key envelope، media abuse/signature/expiry، unique races، pagination/aggregation تحت حجم بيانات ممثل وprovider timeouts وrate limiting عبر deployment الفعلي.
- SLO/load budget وعدد المستخدمين/حجم الكتالوج وحدود provider تُعتمد في S3-01 ثم تقاس؛ لا ادعاء أداء بلا dataset أو حد قبول. الاختبارات الحقيقية لا ترسل abuse غير مصرح لخدمات خارجية، والـfixtures معزولة.
- أي defect يمنع رحلة أساسية أو يعرض المال/البيانات لا يُؤجل كتحسين. لا تضمن هذه المراجعة انعدام كل العيوب؛ توثق الباقي وتمنع القبول عند أثر غير مقبول.

### S3-20 — Final product acceptance وإغلاق الـMVP (2–4 ساعات BE1 للتنسيق)

- Models/Zod/controllers/routes: لا feature جديدة لهذه Story؛ مقارنة العقد والكود الفعلي بمصفوفات §17 وإغلاق كل required row. أي feature ناقصة تعود لStory تنفيذ داخل Sprint 3 قبل القبول، لا تُخفى في checklist.
- Owner قبول المنتج: ممثل المنتج؛ BE1 للدليل التقني، FE1/FE2/FE3 وUX1 لواجهات وتجارب الأدوار. ساعات FE/UX والمراجعة التجارية تُقدَّر منفصلة، ولا تدخل تلقائيًا في ساعات BE1 أعلاه.
- قبول: نسخة Staging منشورة وثلاثة حسابات demo، خطوات تشغيل من بيئة نظيفة، flows فعلية على desktop/mobile/browsers المتفق عليها، أدلة الدفعات/الاسترداد/التسويات، وموافقة مؤرخة على كل Acceptance Criterion.
- حزمة التسليم: README/OpenAPI/environment placeholders، student/instructor/admin guides، ops runbooks، backup/restore/rollback، demo data معزولة، known limitations غير الأساسية، scenario كامل وbackup demo recording منقح بلا أسرار أو اعتماد وسائط صالح.
- صفحات privacy/terms/refund: FE1 + UX1 مع محتوى يوافق عليه ممثل المنتج والمراجع المناسب؛ سياسة refund في الصفحة تطابق API. تكون ضمن تجهيز التسليم النهائي، واعتمادها الملائم شرط أي commercial launch. لا يكتب BE1 سياسة قانونية نهائية من عنده، ولا ينقلها إلى Sprint 4.
- verify: release-candidate build ثابت، sign-offs ومصفوفة §17 كلها PASS للمنتج المطلوب. Git publish/hosting/تغيير حسابات المزود ليست إجراءات تُنفذ بمجرد كتابة هذه الخطة؛ يلزم تكليف التنفيذ المناسب.

## 10. API Contracts المقترحة للتسليم التدريجي

كل المسارات أدناه تحت `/api/v1`. أسماء routes نهائية بعد مراجعة S3-01؛ الموارد المقترحة هنا لا تعني أنها متاحة الآن. Validation 400 وفق العقد الحالي، مع 401/403/404/413/429/500 envelopes و409 للـstate/idempotency conflicts؛ لا تغيير صامت إلى 422. التفريق بين 403 و404 يراعي منع كشف ownership.

| Method / path | Owner / الدلالة |
| --- | --- |
| GET `/admin/users` و`/admin/users/:userId` | admin، بحث/filters وDTO محدود |
| PATCH `/admin/users/:userId/status` | admin، status/reason/expectedRevision؛ 200 بعد commit |
| POST `/admin/courses/:courseId/archive` | admin؛ لا delete؛ 200 نتيجة مستقرة |
| PATCH `/admin/courses/:courseId/access-policy` | admin، available/blocked مع reason/revision/audit؛ لا عرض تفاصيل قانونية حساسة للطالب |
| POST `/admin/orders/:orderId/refunds` | admin، Idempotency-Key، reason؛ 202 محفوظ وليس completed |
| GET `/admin/refunds` و`/admin/refunds/:refundId` | admin، status/amount/order/ref-safe metadata |
| POST `/webhooks/stripe` | موجود؛ توسيع signed event handling لا Bearer auth ولا webhook آخر |
| GET `/admin/earnings` و`/admin/earnings/summary` | admin، query bounded وتعاريف §7.4 |
| GET `/admin/instructors/:instructorId/settlement-preview` | admin، exact snapshot preview غير ملزم للحجز |
| POST `/admin/payouts` | admin، instructor/period/cutoff/key؛ 201 draft محجوز أو replay موثق |
| GET `/admin/payouts` و`/admin/payouts/:payoutId` | admin، stable pagination ومعلومات hold |
| POST `/admin/payouts/:payoutId/submit` | admin، ختم الكشف وtransfer attempt؛ 200 لا يعني تحويلًا |
| POST `/admin/payouts/:payoutId/mark-paid` | admin، reference/method/amount/revision/key؛ 200 بعد إثبات التحويل |
| POST `/admin/payouts/:payoutId/cancel` | admin، reason/revision وإثبات no-transfer عند pending |
| POST `/admin/payouts/:payoutId/reconcile` | admin، resolution مقيد وأدلة مرجعية آمنة؛ لا amount rewrite |
| GET `/instructor/finance/summary` و`/instructor/sales` | instructor، own scope مفروض من auth |
| GET `/instructor/earnings` و`/instructor/payouts` و`/instructor/payouts/:payoutId` | instructor، كشفه فقط |
| GET `/admin/dashboard` | admin، metrics قصيرة مع range/asOf/definitions |
| POST `/instructor/courses/:courseId/revisions` | approved instructor owner، candidate واحد |
| GET/PATCH `/instructor/courses/:courseId/revisions/:revisionId` | owner، patch candidate مع expectedRevision |
| POST `/instructor/courses/:courseId/revisions/:revisionId/submit` | owner، readiness ثم pending_review |
| GET `/admin/course-revisions` و`/admin/course-revisions/:revisionId` | admin، compare live/candidate من DTO safe |
| POST `/admin/course-revisions/:revisionId/approve` أو`/reject` | admin، reason للرفض وbase version check |
| PATCH `/instructor/courses/:courseId/corrections` | owner، allowlist تصحيح فقط وaudit |
| GET/POST `/instructor/courses/:courseId/revisions/:revisionId/sections` | owner، قائمة candidate/إنشاء section logicalId مستقل |
| PATCH/DELETE `/instructor/courses/:courseId/revisions/:revisionId/sections/:sectionId` | owner، تعديل/حذف ضمن candidate فقط؛ sectionId لا يؤخذ كمسار live |
| PUT `/instructor/courses/:courseId/revisions/:revisionId/sections/order` | owner، orderedIds permutation كاملة مع expectedRevision |
| POST `/instructor/courses/:courseId/revisions/:revisionId/sections/:sectionId/lessons` | owner، درس candidate مع هوية ثابتة عند apply |
| PATCH/DELETE `/instructor/courses/:courseId/revisions/:revisionId/lessons/:lessonId` | owner، تحقق revision membership والـownership |
| PUT `/instructor/courses/:courseId/revisions/:revisionId/sections/:sectionId/lessons/order` | owner، reorder داخل section candidate لا lessons عامة |
| POST `/instructor/courses/:courseId/revisions/:revisionId/lessons/:lessonId/video-upload` | owner، Mux attempt بسياق revision لا يكتب live |
| POST `/instructor/courses/:courseId/revisions/:revisionId/media/upload-intents` | owner، purpose cover/lesson_attachment وtarget candidate فقط |
| POST `/instructor/courses/:courseId/revisions/:revisionId/media/:assetId/confirm` | owner، trusted metadata + revision context ثم ربط candidate |
| DELETE `/instructor/courses/:courseId/revisions/:revisionId/media/:assetId` | owner، detach candidate/reference-aware cleanup لا حذف live |
| GET `/instructor/courses/:courseId/revisions/:revisionId/lessons/:lessonId/playback` | owner، review credential للcandidate من backend، ليس public preview |
| GET `/admin/course-revisions/:revisionId/lessons/:lessonId/playback` | admin، review credential للcandidate؛ قواعد الحماية نفسها |
| GET `/instructor/courses/:courseId/revisions/:revisionId/lessons/:lessonId/attachments/:assetId/download` | owner، PDF candidate authenticated؛ لا raw URL |
| GET `/admin/course-revisions/:revisionId/lessons/:lessonId/attachments/:assetId/download` | admin، PDF review ومطابقة asset للـrevision |
| POST `/instructor/courses/:courseId/revisions/:revisionId/reopen` | owner، rejected → editable وفق expectedRevision مع حفظ قرار الرفض |
| POST `/instructor/courses/:courseId/revisions/:revisionId/discard` | owner، candidate editable فقط، حفظ audit وreference-aware cleanup |

تحديث العقود الموجودة: student orders تعرض refund state المسموح دون provider secrets؛ library تعرض archive/access/refund reasons؛ admin order detail يعرض payment transaction reference المطلوب بـADM07؛ protected access/progress يتوافقان مع جدول §8.2. لا إضافة routes جديدة تعيد auth أو checkout أو library القائمة.

S3-18 يضيف avatarUrl وcounts/duration إلى response schemas الحالية. عقود candidate المقترحة أعلاه كاملة على مستوى العمليات اللازمة، وrequest/response field constraints والأمثلة وpagination/error codes تُثبت قبل بدء S3-13 لا بعده. كل المسارات تتحقق من courseId/revisionId/sectionId/lessonId المتلازمة؛ model ID صالح لا يعني أنه تابع لهذا الـcandidate.

DTO مالي: المبلغ integer مع currency، ID/status/UTC dates وsafe reason/hold code. `Idempotency-Key` محدود الطول والنمط؛ الرد المرجع الأول يُعاد للمستخدم المصرح نفسه. `expectedRevision` للـoptimistic concurrency؛ كل replay يُوثَّق status code/body الخاص به. 503 لعدم توفر تشغيل الطلب قبل قبوله، وليس لتأكيد فشل مالي مجهول بعد إرساله.

## 11. التبعيات وتسليم الفريق

```text
S3-01 policies + baseline
├─ S3-18 prior-feature gaps + full MVP traceability
├─ S3-02 financial foundation
│  ├─ S3-05 refund request → S3-06 events → S3-07 repurchase
│  └─ S3-08 eligibility → S3-09 reservation → S3-10 settlement
│     └─ integration with S3-06 mandatory before payout release
├─ S3-03 admin users → S3-04 archive/access policy
├─ S3-11 instructor finance + S3-12 admin dashboard (after money states stable)
└─ S3-13 candidates → S3-14 review/apply/media/progress
   all streams + S3-19 hardening → S3-15 operations
   → S3-16 staging → S3-17 handoff → S3-20 product acceptance
```

هذا dependency map وليس دعوة لبناء features كلها مرة واحدة. BE1 ينفذ المسار المتفق عليه story by story؛ يمكن تسليم DTO mocks مبكرًا للفريق لكن لا تنشر عملًا غير جاهز.

ترقيم S3-18/19/20 إضافات للإغلاق وليس ترتيبًا يؤخرها للنهاية: S3-18 يبدأ بعد S3-01 لتحديد النواقص قبل بقية الميزات، وS3-19 يُنفذ تدريجيًا بعد كل feature ثم كـrelease gate. S3-20 وحده النهاية. أي migration/index أو monitoring لازم للـfeature يُشحن معها؛ S3-15 للتحقق التشغيلي النهائي، لا تأجيل كل التشغيل لآخر يوم.

| الفريق | التسليم المنتظر |
| --- | --- |
| FE1 | refund pending/success/failure في history، access revoked/archive retained، repurchase وprogress states؛ لا trust للـredirect |
| FE2 | sales/earnings/debt/holds/payout history؛ live مقابل candidate/review/rejection؛ archived course display |
| FE3 | users suspension/reasons، archive، refund administration، settlement preview/seal/unknown/paid، metrics/reference drill-down |
| UX1 | labels money دقيقة، confirmations خطرة، pending/unknown states، accessibility/responsive، لا زر تحويل مكرر |
| BE1 | policy/contract/implementation/tests/migrations/monitoring/runbooks وevidence؛ commercial security review يحتاج مختصًا قبل live launch |

قائمة frontend handoff لكل Story: method/path، auth/role، request/response examples، error codes، pagination، state transitions، disable/retry rules. client disable button لا يغني عن atomic server guard.

## 12. السعة والتقدير — لا التزام زمني وهمي

التقديرات الأولية للساعات المخططة للـbackend وحده، تشمل اختبارات المطور والعقد. تحتاج calibration بعد أول Story؛ إذا كانت Staging غير جاهزة تُضاف أوقات تجهيز/تعطّل معلنة، لا تخفى في buffer.

| Story | ساعات مخططة |
| --- | --- |
| S3-01 | 3–4 |
| S3-02 | 4–6 |
| S3-03 | 4–6 |
| S3-04 | 4–6 |
| S3-05 | 6–8 |
| S3-06 | 7–10 |
| S3-07 | 4–6 |
| S3-08 | 5–7 |
| S3-09 | 6–8 |
| S3-10 | 6–8 |
| S3-11 | 4–6 |
| S3-12 | 4–6 |
| S3-13 | 6–8 |
| S3-14 | 8–12 |
| S3-15 | 6–8 |
| S3-16 | 6–10 |
| S3-17 | 4–6 |
| S3-18 | 6–10 |
| S3-19 | 6–10 |
| S3-20 | 2–4 |
| المجموع | 101–149 |

سعة الخطة العامة: BE1 واحد × 20 ساعة/أسبوع × أسبوعين = 40 ساعة متاحة، 32 مخططة و8 buffer بنسبة 20% من الوقت المتاح. خيار 35 ساعة/أسبوع، غير معتمد بعد، يوفر 56 مخططة و14 buffer؛ حتى هذا أقل من نطاق الخطة الحالي.

101–149 ساعة مخططة تعني نحو 126–186 ساعة متاحة عند نفس buffer؛ نحو 6.3–9.3 أسبوع على baseline، أو 3.6–5.3 أسبوع عند 35 ساعة/أسبوع. ليست وعدًا بالمدة، ولا يمكن استخدام سعة الفرونت كأنها BE تلقائيًا. التقدير السابق العام 24 ساعة للماليات والإدارة غير كافٍ لهذه التفاصيل والمراجعات والـcarry-in؛ يُحدّث ولا يُستخدم لإخفاء المخاطر. Frontend/UX والوقت الإضافي لنواقص غير معروفة أو provisioning أو انتظار موافقات منفصلة؛ يُعاد تقديرها عند اكتشافها، وليست ضمانًا بأن الرقم يشمل أي مقدار من الإصلاحات.

قرار مطلوب مع توجيه المستخدم أن هذا آخر Sprint: تمديد نافذة الإغلاق أو توفير مساعدة backend مؤهلة/زيادة السعة المؤكدة، مع تعديل موعد التسليم رسميًا. يُمكن تقسيم العمل إلى دفعات قبول داخل Sprint 3، لكنها ليست Sprint 4 ولا إغلاق MVP ناقص. إذا أُصر على timebox أسبوعين رغم عدم كفاية السعة، لا يمكن اعتماد التزام كامل النطاق؛ يرجع التعارض لصاحب المنتج قبل التنفيذ. توصية الترتيب: السياسات وgap audit، ضمانات users/archive، ثم refund → eligibility/payout المتكامل، ثم views/revisions وrelease gates. لا نطلق payouts قبل اختبارات refund races ولا نحذف versioning بصمت.

هدف الأسبوعين 5–6 في Project Plan يظل مشروطًا بحل السعة. freeze/stabilization يبدأ عندما يكتمل نطاق release المرشح، وليس تاريخًا يجبرنا على تسليم الماليات ناقصة.

## 13. Verification matrix وStaging acceptance

Unit لسياسات المال والحالات والوقت وpresenters؛ HTTP بـSupertest للصلاحيات/validation/envelopes؛ integration بـMongo replica set المعزول للتزامن والفهارس والrollback؛ provider adapter contracts وfault injection؛ ثم تجربة فعلية Staging. لا مشاركة development DB ولا live charges.

| ID | الحالة | دليل القبول المطلوب |
| --- | --- | --- |
| B01 | suspend/reactivate users وآخر admin | fresh permissions + concurrent guard + history retained |
| B02 | archive course | مختفٍ من catalog/شراء جديد؛ existing buyer library/media/progress يعمل |
| B03 | refund request replay | عملية واحدة وfingerprint conflict، 202 لا يقطع access |
| B04 | genuine full refund success | Stripe Test + signed event + amounts/status/slot/access/ledger مطابقة |
| B05 | refund pending/failed/unknown | no false success/failure، hold وrecovery وحالات واجهة صحيحة |
| B06 | duplicate/out-of-order/crash | effect واحد بعد restart/replay وlease stale مرفوض |
| B07 | eligibility/timezone | approved window وcalendar month وحدود exact وlegacy backfill |
| B08 | net payout/debt | خصم كل carry-forward دون تصفية الموجب فقط، net≤0 محفوظ |
| B09 | concurrent draft creation | active claim واحد وعناصر/مبلغ exact بلا orphan reservation |
| B10 | refund vs draft/pending/paid | تنفيذ كل صف §7.2، لا تعديل كشف sealed أو double debit |
| B11 | external transfer unknown | no auto-cancel/retry، reconcile موثق، simulated manual transfer فقط |
| B12 | full refund ثم repurchase | new sourceOrderId، old refund لا يلغي enrollment الجديد |
| B13 | finance dashboards | owner isolation، sums exact، safe references، no PII/secrets |
| B14 | published material candidate | live unchanged قبل approval/reject؛ snapshot orders محفوظ |
| B15 | revision media/progress | candidate webhook isolation، safe cleanup، dynamic completion |
| B16 | shutdown/outage/backlog | finite deadline وfenced writes/recovery، alerts بحدود معتمدة |
| B17 | backup/restore/rollback | DB معزول، مالية مُصالحة مع provider، منع إعادة refund/transfer |
| B18 | frontend 3-role demo | responsive/error states/permissions وOpenAPI مطابقة للتنفيذ |
| B19 | profile/avatar/course detail completeness | avatarUrl قابل للعرض دون تركيب ID، counts/duration صحيحة، full STU03/details contract |
| B20 | Auth/security/privacy regression | role matrix وCORS/cookie/refresh/validation/rate/redaction وdependency/secret scan موثقة |
| B21 | full MVP product closure | كل STU/INS/ADM/BR/acceptance/NFR لها دليل، guides/demo recording وموافقة المنتج |

الحالة الأولية لكل B01–B21: **NOT RUN**. يُنشأ أثناء التنفيذ ملف `sprint_3_staging_evidence.md` لكل حالة: environment/build/UTC/operator/PASS أو FAIL أو NOT RUN، مرجع sanitized، observed vs expected، defect/retest. لا receipts مالية أو keys أو signed URLs في Git. تحفظ أدلة حساسة في مكان مقيد وتذكر مرجعًا غير سري فقط.

أوامر التحقق الأساسية موجودة: `npm run lint`, `npm test`, `npm run verify`. أوامر migration/refund-recovery/eligibility المقترحة تُسمّى وتوثق عند تنفيذ Stories، لا يُكتب هنا أمر غير موجود باعتباره يعمل. CI يتضمن contract validation وregression؛ tests الفعلية لا تعتمد على internet، وتجارب provider الحقيقية منفصلة ومصرّح بها.

## 14. التشغيل والمخاطر والإطلاق

| الخطر | الضمان / الاستجابة |
| --- | --- |
| refund أو payout مكرر | DB uniqueness + idempotency + serialized finance state + replay tests |
| bank sent لكن DB لم تسجل paid | sealed attempt وunknown hold؛ reconciliation يدوي قبل أي تحويل جديد |
| worker قديم بعد shutdown/lease expiry | fencing على writes وfinite drain، لا cancellation شكلي |
| دين سالب ضائع | carry-forward شامل + dashboard explicit debt + tests على فترات مختلفة |
| backup قديم يعيد financial side effect | restore isolated ثم provider reconciliation، workers موقوفة حتى اعتماده |
| archival يقطع وصول المشترين | shared access policy + كامل read-path regression |
| candidate يغيّر live بلا قبول | isolated revisions/context وatomic publish وmedia ref retention |
| كشف Payout أو Course document كبير | normalized rows + bounded transactions؛ capacity error لا truncate |
| بيانات/أسرار في logs/evidence | DTO/log allowlists، secret scan، no raw payloads/private URLs |
| وقت أقل من العمل | capacity decision معلن وre-estimation؛ لا اختزال معايير السلامة |

Monitoring المقترح: inbox backlog age، retries/dead letters، refunds unknown/pending age، transfer unknown duration، finance holds، orphan reservations، reconciliation mismatches، worker lease errors، endpoint latency/error rates، provider readiness. Thresholds وأصحاب التنبيه تُعتمد وتُختبر؛ لا health endpoint عام يكشف أرصدة أو provider IDs.

Security gate: أي secret سبق مشاركته في محادثة أو ظهر في log/ملف غير آمن يُدوّر قبل نشر Staging؛ تراجع scopes ومفاتيح Test/Live وsecret scan. لا تُدرج القيم في الخطة أو `.env.example`، ولا يرفع `.env` إلى Git. التدوير إجراء تنفيذي منفصل يحتاج تنسيقًا حتى لا يعطل webhook/provider الحالي.

Release: backup → dry-run/schema/index rollout → migration report → workers ذات guards → feature enable → smoke → evidence. Rollback موثق لكل schema/state؛ features الجديدة يمكن وقف إصدار عملياتها دون إسقاط processing لأحداث مالية موجودة. لا نوقف reconciliation ونترك ماليات معلقة بلا مشغّل.

التسليم التجريبي Test Mode لا يعني commercial readiness. قبل live launch: بوابة دفع/كيان قانوني مناسب، مراجعة أمن/ماليات، سياسات خصوصية وشروط واسترداد معتمدة، مراقبة ونسخ احتياطية وتشغيل ومسؤوليات. هذه شروط إطلاق، لا وعد بأن Sprint 3 وحده يحققها تلقائيًا.

## 15. Definition of Done — غير مكتملة حتى الدليل

- [ ] قرارات §4 معتمدة، والنطاق/السعة/الجدول المتبقي واضحان.
- [ ] Sprint 2 A01–A19 منفذة ومقبولة، لا اعتماد على دليل local فقط.
- [ ] Admin users/status وآخر admin، والأرشفة مع وصول المشترين تعمل دون hard delete.
- [ ] Refund كامل ناجح/فاشل/معلق وrecovery وإعادة الشراء تختبر مع provider Test الحقيقي.
- [ ] Eligibility/negative carry/payout draft/seal/paid/cancel/unknown صحيحة ومتزامنة مع refunds.
- [ ] INS09/10 وADM07/08/10 مكتملة، aggregates exact وrole isolation مثبتة.
- [ ] Material revisions مع review/live isolation وتوافق الوسائط والتقدم تحقق سياسة المنتج المعتمدة.
- [ ] لا mutations مباشرة في snapshots/history؛ audit مناسب وكل transition خطرة متتبعة.
- [ ] migrations/indexes/dry-run/repeat/backup/restore/rollback موثقة ومجرّبة.
- [ ] lint + tests + contract validation ناجحة، وكل defect مهم عولج وregression مضاف.
- [ ] Staging B01–B21 مكتملة بالدليل، وتكامل الأدوار الثلاثة مع الفرونت مقبول.
- [ ] OpenAPI/README/handoff/runbooks مطابقون لما يعمل بالفعل، وأي limitation موثق بصاحبه.
- [ ] demo نهائي وقبول صاحب المنتج؛ لا ادعاء zero defects أو commercial readiness.
- [ ] مصفوفات §17 مكتملة لكل 32 feature و10 business rules و14 acceptance criteria وكل NFR؛ لا missing/blocker/NOT RUN في متطلب أساسي.
- [ ] profile/avatar/detail fields قابلة للاستخدام، ونواقص Sprint 1/2 عولجت في Sprint 3 دون إعادة تنفيذ الموجود.
- [ ] contracts للـcandidate كاملة، policy versions/idempotency indexes محكمة واختبارات التزامن تشملها.
- [ ] release package وguides وbackup demo recording مسلّمة، وسياسات الموقع ومشغّل الدعم/التشغيل لهم owners وقبول موثق.

## 16. مراجع تقنية للتصميم

هذه المراجع لتأكيد آليات المزود/قاعدة البيانات، لا لتغيير نطاق الـMVP:

- [Stripe webhooks](https://docs.stripe.com/webhooks): التوقيع وraw body وduplicate/order/retry handling.
- [Stripe event types](https://docs.stripe.com/api/events/types): أحداث refund ومطابقة أنواعها مع endpoint configuration.
- [Stripe Refund object](https://docs.stripe.com/api/refunds/object) و[Refunds](https://docs.stripe.com/refunds): حالات refund، الحقيقة المالية، full/partial.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests): حدود retention وpayload consistency.
- [MongoDB Node transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/): transactions/retry وحدود التعامل معها؛ الشبكة الخارجية ليست جزءًا ذريًا منها.

## 17. مصفوفة إغلاق الـMVP كاملًا — لا متطلب أساسي مؤجّل

الغرض من المصفوفة تحويل «آخر Sprint» إلى معيار قابل للتحقق. الحالة أدناه نتيجة قراءة الكود/الأدلة، وليست إثبات قبول على Staging. `موجود محليًا` يعني يوجد مسار implementation أولي يحتاج regression وتكامل؛ `جزئي` يعني ظهر نقص محدد؛ `مخطط` يعني Stories Sprint 3 ستضيفه. كل الصفوف **قبولها NOT RUN** حتى تسجيل evidence.

S3-18 يفتح Gap Register في S3-01 ويحدثه طوال التنفيذ: source ID، behavior المتوقع، observed/code reference، severity/impact، subtask/story، BE/FE owner، reviewer، estimate، acceptance evidence وretest. كل نقص أساسي مكتشف يُضاف داخل Sprint 3. لا يحل سطر في الجدول محل implementation أو اختبار، ولا تمحى findings لمجرد انتهاء الوقت.

### 17.1 كل وظائف الطالب والمحاضر والأدمن

| MVP ID | الوظيفة | الحالة الحالية | إغلاق backend / evidence | Owner واجهة التكامل |
| --- | --- | --- | --- | --- |
| STU01 | register/login/logout | موجود محليًا | S3-18/19/16؛ A01 + B20/B21 | FE1 |
| STU02 | email verify/password recovery/reset | موجود محليًا | S3-18/19/16؛ expiry/replay/mail delivery + B20/B21 | FE1 |
| STU03 | الاسم والصورة والملف الأساسي | موجود محليًا؛ avatarUrl أُضيف بإغلاق Sprint 1/2، لا Staging proof بعد | S3-18؛ B19/B21 وحقول أساسية معتمدة | FE1 |
| STU04 | published catalog/search by name | موجود محليًا | S3-04/18/19/16؛ published-only/search/privacy | FE1 |
| STU05 | category/free-paid filters | موجود محليًا | S3-18/16؛ combined filters/pagination/no results | FE1 |
| STU06 | details/curriculum/instructor/price | موجود محليًا؛ counts/duration أُضيفا بإغلاق Sprint 1/2 | S3-18/14/16؛ §6.1 MVP + B19 | FE1 |
| STU07 | preview بلا شراء | موجود محليًا | S3-04/14/19/16؛ preview true فقط وno private PDF leakage | FE1 |
| STU08 | single-course checkout/payment result | موجود محليًا | S3-05/06/07/16؛ webhook truth/success/failure/cancel | FE1 |
| STU09 | My Courses | موجود محليًا | S3-04/07/16؛ paid/free/archive/refund/repurchase | FE1 |
| STU10 | play/navigation/allowed PDF | موجود محليًا | S3-04/07/14/19/16؛ real credentials/expiry/ownership | FE1 |
| STU11 | lesson complete/last lesson/progress | موجود محليًا | S3-07/14/18/16؛ dynamic denominator/resume | FE1 |
| STU12 | order history/status | موجود محليًا | S3-06/07/18/16؛ refund pending/success وsafe DTO | FE1 |
| INS01 | application/bio/expertise/optional links | موجود محليًا | S3-18/19/16؛ public registration لا يمنح instructor | FE2 |
| INS02 | status/rejection reason | موجود محليًا | S3-18/16؛ resubmit مع history، reason ظاهر للمالك | FE2 |
| INS03 | course draft/basic edit | موجود محليًا | S3-18/13/16؛ owner isolation وmaterial edit semantics | FE2 |
| INS04 | sections/lessons/reorder/delete قبل النشر | موجود محليًا | S3-18/13/14/16؛ complete permutations/transactions | FE2 |
| INS05 | video/description/optional PDF | موجود محليًا | S3-13/14/18/16؛ Mux/Cloudinary direct + readiness | FE2 |
| INS06 | mark preview lessons | موجود محليًا | S3-13/14/18/16؛ public preview flags وrevision effects | FE2 |
| INS07 | submit review/view decision/reason | موجود محليًا | S3-13/14/18/16؛ initial + candidate review/reopen | FE2 |
| INS08 | own courses/status list | موجود محليًا؛ archived/revisions غير موجودة | S3-04/13/18/16؛ status enum/filter/contracts تحديث | FE2 |
| INS09 | sales count/earnings/pending/paid | مخطط | S3-08/11/16؛ B07/B08/B13 وexact definitions | FE2 |
| INS10 | monthly payout history | مخطط | S3-09/10/11/16؛ B09/B10/B11/B13 | FE2 |
| ADM01 | users/search/roles/status | مخطط | S3-03/16؛ B01/privacy/pagination | FE3 |
| ADM02 | approve/reject instructor مع reason | موجود محليًا | S3-03/18/19/16؛ concurrency/current permissions | FE3 |
| ADM03 | suspend/reactivate/history preserved | مخطط | S3-03/19/16؛ last-admin/sessions/financial history | FE3 |
| ADM04 | category create/edit/archive | موجود محليًا | S3-18/16؛ isActive=false، لا hard delete، review/checkout policy | FE3 |
| ADM05 | course review/notes | موجود محليًا للنشر الأول؛ candidate مخطط | S3-13/14/18/16؛ initial/revision readiness/notes | FE3 |
| ADM06 | archive + retain buyer access | مخطط | S3-04/16؛ B02/shared policy/BR09 | FE3 |
| ADM07 | orders/payments/gateway transaction ID | جزئي؛ gateway reference غير موجود في admin DTO | S3-06/12/16؛ B13 وadmin-only references | FE3 |
| ADM08 | commission/instructor earnings | مخطط | S3-08/11/12/16؛ 20/80 snapshots/refunds/debts | FE3 |
| ADM09 | manual payout/markPaid/no duplication | مخطط | S3-09/10/16؛ B08–B11 وsimulated transfer | FE3 |
| ADM10 | concise users/content/sales metrics | مخطط | S3-12/16؛ §8.1 MVP وB13 | FE3 |

المصفوفة تحصي 32 متطلبًا وظيفيًا صريحًا. تفاصيل Course §6.1/§7.1، والملف التعريفي للمحاضر وقواعد الصلاحيات §4 تُراجع ضمن الصفوف المرتبطة، لا تُسقط لأنها لا تحمل ID منفصلًا. سعر الكورس المجاني priceMinor=0 لا يحتاج boolean حر من العميل يناقض السعر.

### 17.2 قواعد العمل والرسم المعتمد

| Rule | ضمان الإغلاق | Story / الدليل |
| --- | --- | --- |
| BR01 | title/description/image/category/price/section/lesson قبل publish | S3-14/18/16؛ initial/revision readiness |
| BR02 | submit لا يقبل incomplete draft أو candidate | S3-13/14/18/16؛ Zod + domain validation |
| BR03 | لا repurchase لبيع ناجح؛ full refund يفتح شراء صحيح مرة واحدة | S3-06/07/16؛ purchaseSlot/old-event fences |
| BR04 | free enrollment مباشر بلا paid Order | S3-07/18/16؛ A10 وعدم sale/commission |
| BR05 | completed current published lessons / total | S3-14/18/16؛ 0/partial/100% والتقريب الموثق |
| BR06 | إضافة درس منشور قد تخفض النسبة | S3-14/16؛ denominator/completedAt/reload UI |
| BR07 | لا destructive delete لكورس له مشترون | S3-04/13/14/19/16؛ archive/history/retention |
| BR08 | لا حذف instructor له sales | S3-03/19/16؛ suspend/history/owed money |
| BR09 | archived retains access إلا legal/security block | S3-04/07/16؛ available/blocked وفك block لا ينشر |
| BR10 | كل رفض له reason ظاهر للمالك | S3-14/18/16؛ instructor/course/revision decisions |

تعارض لفظي في Acceptance payment-only مع BR04 يُفسر للمدفوع فقط، وليس منع الالتحاق المجاني. `instructorStatus` في الرسم/الـMVP لا يفرض duplicate suspension field؛ User.status هو مصدر تعليق الحساب. الرسم هو المرجع المالي الأساسي، وتوسعات policy/audit/locks/revisions تحفظ ضماناته بدل تغيير shares أو إدخال OrderItem غير المعتمد.

### 17.3 كل معايير قبول المنتج في MVP §15

AC IDs التالية محلية لتسهيل التتبع، ولا تنسب إلى المستند كأنه سمّاها كذلك.

| ID | معيار القبول الأصلي | إغلاق / صاحب الدليل |
| --- | --- | --- |
| AC01 | register/verify/login/recover | STU01/02؛ S3-18/19/16؛ BE1 + FE1 |
| AC02 | instructor apply/admin accept-reject/reason | INS01/02 + ADM02؛ S3-18/16؛ BE1 + FE2/FE3 |
| AC03 | instructor creates complete course/submits | INS03–07؛ S3-18/13/14/16؛ BE1 + FE2 |
| AC04 | لا public course قبل admin publish | S3-04/14/19/16؛ BE1 + FE1/FE3 |
| AC05 | published course شراء بسعر agreed وينجح Test payment | S3-06/07/16؛ snapshots مقابل genuine provider payment؛ BE1 + FE1 |
| AC06 | paid enrollment بعد trusted success webhook فقط | S3-06/07/16؛ free exception BR04 موثقة؛ BE1 |
| AC07 | duplicate webhook لا enrollment/earning إضافية | S3-06/09/16؛ concurrent/replay/restart counts؛ BE1 |
| AC08 | My Courses/play/progress محفوظ | S3-04/07/14/18/16؛ BE1 + FE1 |
| AC09 | منع non-paying user من protected video/PDF | S3-04/07/19/16؛ anonymous/foreign IDs/expiry؛ BE1 |
| AC10 | own instructor earnings/platform20% | S3-11/12/16؛ snapshots/net/refund semantics؛ BE1 + FE2/FE3 |
| AC11 | payout يُسجل paid بلا double due | S3-09/10/16؛ transfer simulation/unknown cases؛ BE1 + FE3 |
| AC12 | كل الرحلات desktop/mobile بلا clipping/overlap | S3-16/20؛ FE1/FE2/FE3 + UX1، لا backend unit test بديلًا |
| AC13 | loading/empty/error states واضحة | S3-16/20؛ الثلاثة أدوار/timeout/retry/negative debt؛ FE + UX1 |
| AC14 | لا secrets/payment credentials في browser client | S3-19/16/20؛ bundle/network/log/cache scan؛ BE1 + FE3 |

### 17.4 المتطلبات غير الوظيفية والقرار التقني

| ID / MVP §13 | إغلاق مطلوب داخل Sprint 3 | Owner / Story |
| --- | --- | --- |
| NFR01 Security | bcrypt/JWT/refresh/roles/Zod/rate limit، HTTPS/CORS/cookies/CSRF بحسب auth، current permission checks | BE1؛ S3-19/16 |
| NFR02 Payments | signatures/raw body/no cards، provider reconciliation/idempotency/snapshot | BE1؛ S3-05/06/09/10/19/16 |
| NFR03 Privacy | minimal role-specific DTOs/own scopes، no email في public instructor، retention/redaction | BE1 + FE3؛ S3-11/12/18/19 |
| NFR04 Performance | pagination bounded، lazy-load images FE، no Node video proxy، measured queries/load/SLO | BE1 + FE؛ S3-18/19/16 |
| NFR05 Media | direct uploads، signed Mux/authenticated PDF، size/format/ownership/provider truth | BE1 + FE2/FE1؛ S3-13/14/18/19/16 |
| NFR06 Reliability | sanitized logs، periodic backups بجدول/retention/owner، alerts/recovery/restore | BE1؛ S3-15/16 |
| NFR07 Compatibility | current Chrome/Edge/Firefox/Safari وdesktop/mobile؛ تسجيل النسخ الفعلية وقت الاختبار | FE + UX1؛ S3-16/20 |
| NFR08 Usability | loading/empty/error/confirmation/accessibility، recovery دون workaround يدوي لحالة paid | FE + UX1؛ S3-16/20 |
| NFR09 Quality | code review + unit/HTTP/integration/concurrency/failure/critical regression | BE1/Reviewer + FE؛ S3-19/16/20 |
| NFR10 Environments | dev/test/staging/prod configs معزولة، secrets manager/rotation، env placeholders وdeployment guide | BE1 + FE3؛ S3-01/15/19/20 |

MVP §14 technical decisions مستمرة: React عند الفريق، REST Express، Mongoose indexes، العقد قبل تكامل الواجهة، media خارج DB/Git، وpayment adapter مستقل. الفصل بين dev/test/staging/production لا يتطلب نشر commercial production بأموال حقيقية في هذه التجربة؛ config/runbook آمنان، والنشر live له بوابة منفصلة لا يُدَّعى اجتيازها.

الأداء والتوافق والمراقبة وbackup ليست مجرد فقرات توثيق: تتحدد في S3-01 dataset/load وlatency/error budget، period/retention/RPO/RTO، thresholds/alert owner وincident contact، ثم تُختبر في S3-15/16/19. الأرقام يقرها الفريق والمنتج حسب السعة الفعلية لا يختلقها BE1.

### 17.5 حزمة التسليم والاعتماد النهائي

| المخرج | Owner | شرط القبول |
| --- | --- | --- |
| Staging backend + frontend integrated build | BE1 + FE3 | URLs/build IDs وTLS/ingress الحقيقي، لا localhost بديلًا |
| README/organized repo/clean setup | BE1 + FE3 | تشغيل من بيئة نظيفة بالأوامر الموثقة، no .env أو fixtures secrets |
| OpenAPI + examples + complete frontend handoff | BE1، مراجعة FE3 | coverage actual operations/roles/DTO/errors + zero undocumented product endpoint |
| Demo data للأدوار الثلاثة | BE1 + FE3 | بيانات مستقلة وseeds idempotent، كلمات مرور خارج Git، لا patch financial truth |
| Student guide | FE1 | auth/search/preview/purchase/free/library/player/progress/history/refund states |
| Instructor guide | FE2 | apply/create/upload/review/revisions/archive/sales/earnings/debt/payout history |
| Admin/operations guide | FE3 + BE1 | users/review/categories/refunds/hold/payout unknown/reference/alerts/recovery |
| Backup/restore/rollback/deployment settings | BE1 | actual rehearsal ودليل RPO/RTO وprovider reconciliation وتفعيل alerts |
| Privacy/terms/refund page package | ممثل المنتج + FE1/UX1 | محتوى معتمد ملائم للنسخة التجريبية، refund rule يطابق backend، صلاحية commercial تحتاج مراجعة مناسبة |
| Acceptance evidence + issue register | الفريق، قبول ممثل المنتج | A01–A19 وB01–B21 وكل matrices؛ PASS بإصدارات وتواريخ لا missing evidence |
| Demo scenario + backup recording | FE1/FE2/FE3 + BE1 | رحلة كاملة واختصار حالات الفشل/refund/payout، recording منقح بلا أسرار |
| Final sign-off | ممثل المنتج + BE1/FE/UX reviewers | كل required scope مقبول؛ لا commercial/zero-defect claim |

محتوى صفحات الشروط والخصوصية خاص بالمنتج ويحتاج موافقة بشرية؛ لا تعتبر هذه الخطة استشارة قانونية أو إذنًا لمعالجة بيانات إضافية. إن كانت سياسة commercial أو بوابة دفع حقيقية غير جاهزة، تصرّح الحزمة أنها MVP تجريبي فقط. هذا ليس تأجيل feature أساسية إلى Sprint آخر.

### 17.6 متى نقول إن الـMVP اتقفل؟

فقط بعد قبول كل الصفوف المطلوبة، وإغلاق defects التي تعطل core journey أو تمس المال/الأمان/البيانات، وتشغيل الواجهات مع API على Staging، وتسليم الحزمة والأدلة. تحسينات خارج MVP §17 وحدها يجوز بقاؤها في backlog مستقبلية؛ لا ننقل STU/INS/ADM أو BR أو شرط تسليم أساسي إليها.

الخطة تغطي النطاق المطلوب؛ لا تعني أن التنفيذ اكتمل أو أن 100% من كل العيوب المحتملة يمكن ضمان غيابها. رفض الجدول غير الواقعي أو توثيق policy blocker لا يُنقص نطاق التسليم: يُحل داخل خطة الإغلاق النهائي قبل sign-off.

أول خطوة تنفيذ بعد قبول الخطة: **S3-01 فقط**؛ اعتماد السياسات وbaseline والعقود وسجل النواقص، ثم S3-18 للنواقص المحددة وS3-02 وفق ترتيب التبعيات. لا توليد Sprint كامل دفعة واحدة.
