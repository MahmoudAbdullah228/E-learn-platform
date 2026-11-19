# Sprint 3 — التنفيذ خطوة بخطوة لإغلاق الـMVP

آخر مراجعة: 2026-11-18. الخطة التفصيلية: [Final MVP closure plan](sprint_3_backend_plan.md).

هذا الملف يحدد ترتيب العمل وحالته؛ لا يعني وجود الميزات المقترحة في API. تحديث S3-01 في نفس التاريخ: [السياسات المختارة](sprint_3_policy_register.md)، [Readiness/baseline](sprint_3_readiness.md)، [العقود](sprint_3_contracts.md). ننفذ Story واحدة في كل مرة، ثم نراجعها ونشغّل الاختبارات ونحدّث العقد ونسلّمها للفرونت قبل الانتقال. الدفعات أدناه داخل Sprint 3 نفسه، وليست Sprints جديدة.

## 1. النسخة التي نبدأ منها

- تم `fetch` ثم تحديث `main` المحلي بـ`pull --ff-only origin main` إلى `64f742a7b319f4d1f3be8f5ff9837ee6c9ab4687` وقت المزامنة.
- هذا الإصدار يتضمن merge لـPR #7، وإصلاح تنظيف الملفات `ad503de`، وإعداد الفرونت من PR #6.
- برانش العمل الجديد: `feature/sprint-3-mvp-closure`، منشأ من النسخة السابقة. لم يحدث push أو commit لهذه القائمة عند إعدادها، ولا merge commit جديد.
- baseline S3-01 الجديد في 2026-11-18 نجح: 432 اختبارًا، بدون fail/skip، مع lint/OpenAPI؛ 295.55 ثانية على DB اختبار معزولة. النتيجة الحالية لا تثبت أي Refund/Payout feature جديدة؛ كلها وثائق تصميم في هذه Story.
- `frontend` الآن scaffold React/TypeScript/Vite وHome route أولي، وليس دليلًا على اكتمال واجهات المنتج.
- A01–A19 على Staging ما زالت NOT RUN بحسب سجل الأدلة؛ لا إغلاق تلقائيًا بعد الدمج على GitHub.

## 2. ترتيب الدفعات

| الدفعة | Stories بالترتيب | الناتج الذي نراجعه قبل الانتقال |
| --- | --- | --- |
| 0 — تثبيت نقطة البداية | إعداد S3-01 المحلي أُنجز؛ متابعة المتبقي من S3-18 | baseline جديد ناجح وسياسات/عقود وسجل نواقص؛ لا إعادة تنفيذ avatarUrl/counts المنجزة |
| 1 — الأساس المالي والتدقيق | S3-02 | models/indexes، policy versions، audit وtransaction guards واختبارات سلامة الأموال |
| 2 — الإدارة والوصول | S3-03 ثم S3-04 | إدارة المستخدمين وتعليقهم، آخر admin، أرشفة الكورس مع وصول المشترين |
| 3 — الاسترداد وإعادة الشراء | S3-05 ثم S3-06 ثم S3-07 | refund محفوظ، provider events/recovery، عكس المستحق وإلغاء access الصحيح، repurchase آمن |
| 4 — الأرباح والتسويات | S3-08 ثم S3-09 ثم S3-10 | أهلية الأرباح، خصم الدين السابق، حجز payout وختمه/paid/cancel/unknown دون double payment |
| 5 — لوحات المالية والإدارة | S3-11 ثم S3-12 | own instructor finance، payout history، admin metrics/transaction references |
| 6 — تعديل الكورس المنشور | S3-13 ثم S3-14 | candidate معزول ومراجعة ونشر ذري، مع حماية الوسائط والتقدم والنسخة الحية |
| 7 — الأمان والتشغيل النهائي | إغلاق S3-19 ثم S3-15 | security/performance regression، migrations، monitoring/backup/restore/rollback مثبتة |
| 8 — قبول وتسليم المنتج | S3-16 ثم S3-17 ثم S3-20 | Staging والأدوار الثلاثة، OpenAPI/handoff/guides/demo، وكل متطلب MVP له قبول فعلي |

S3-19 ليس اختبارًا مؤجلًا إلى الدفعة 7: ضوابطه تُنفّذ مع كل Story، ثم نراجع بوابته الشاملة هناك. وبالمثل أي migration/worker/monitoring يلزم لتشغيل Story يُنفّذ معها؛ S3-15 للتحقق النهائي، لا تأجيل التشغيل كله. تكامل الفرونت يبدأ مبكرًا لكل عقد منفّذ، ولا ينتظر الدفعة 8.

## 3. S3-01 — سجل التنفيذ المحلي

### أ. Baseline / readiness

- [x] مراجعة حالة Git والتأكد من عدم الكتابة فوق تغييرات الفريق؛ تعديلات الخطة السابقة محفوظة.
- [x] تشغيل `npm run verify` في `backend` وتسجيل العدد والنتيجة وتاريخ التشغيل؛ MongoDB `_test` replica set منفصل عن التطبيق، 432 PASS.
- [x] مراجعة النواقص والأدلة القديمة؛ avatarUrl وcounts/duration وإصلاح cleanup موجودون بالفعل؛ سجل G01–G15 يحدد المتبقي.
- [ ] تسجيل frontend build/origin وbackend Staging origin وowners قبل قبول التكامل؛ placeholders لا تُعد روابط فعلية.
- [x] تحديد المتبقي من A01–A19 وأدوار التنفيذ في readiness؛ كلها NOT RUN. لا اعتماد تسليم المنتج بلا الدليل.

### ب. قرارات المنتج المختارة بعد تفويض المستخدم

| القرار | المختار للتنفيذ التجريبي / المتبقي | أثره |
| --- | --- | --- |
| نوع ومدة الاسترداد | full refund يبدأه admin في Test Mode؛ 14 يومًا من paymentConfirmedAt؛ P01–P03 | refund eligibility/deadline وإعداد سياسة الموقع |
| استرداد بعد النافذة | استثناء للنافذة فقط بطلب admin صريح وسبب audited؛ P04 | سيناريو refund بعد payout والدين السالب |
| أهلية الأرباح | بعد انتهاء نافذة الاسترداد مع غياب holds/refund غير محسوم | eligibleAt وworker وسياسة payout |
| إعادة الشراء والتقدم | تفعيل نفس Enrollment بعد full refund المؤكد مع الاحتفاظ بتاريخ التقدم؛ P12/P13 | access/repurchase/resume؛ legal/admin blocks لا يتم تجاوزها |
| تعديل المنشور | live يبقى متاحًا وcandidate منفصل لا يظهر إلا بعد الموافقة؛ P15/P16 | التصحيح المباشر admin-only للعنوان/الوصف المختصر، غيره مراجعة |
| التحويل اليدوي غير المحسوم | sealed payout لا يعدّل ولا يعاد تحويله قبل reconciliation | منع دفع مكرر واحتساب refund متزامن |
| سعة/موعد التسليم | تثبيت الوقت المتاح والموعد بعد إعادة تقدير النواقص الفعلية | لا إسقاط core MVP أو نقلها إلى Sprint 4 |

التفاصيل في Policy register: فوّض المستخدم الاختيار في 2026-11-18 فاختار BE1 الأنسب للـMVP؛ لا ندّعي توقيع مراجع قانوني أو تنفيذ runtime. التشغيل والسعة O01–O07 ما زالت مفتوحة مع owners/gates، ومنها Staging وحدود المعاملات وretention وSLO/RPO/RTO. القرارات التقنية في ADR 0006/0007.

### ج. مخرجات S3-01

- [x] سجل سياسات accepted-for-implementation مع نسخة/authority وأثر زمني وOpen operational inputs؛ لا تتغير مبيعات قديمة بتغيير env.
- [x] ADR 0006 للماليات وADR 0007 لتعديل المنشور؛ القرار التصميمي مسجل، وليس reviewer/product release sign-off.
- [x] gap register G01–G15 بمصدر ودليل وStory/owner/reviewer/tests؛ التقديرات تحت Stories المالكة دون duplicate charging.
- [x] تثبيت contract boundary الداخلي لـS3-02 والعقود الأولى للإدارة/الأرشفة/refund؛ Swagger العام لم يتغير.
- [ ] إعادة تقدير الوقت: خطة الإغلاق الأصلية 101–149 ساعة BE1 قبل معايرة الأجزاء المنجزة والنواقص الجديدة، وليست وعدًا بأسبوعين أو رقمًا جديدًا معتمدًا اليوم.

لا يُنشأ Refund/Payout endpoint أو يُرسل refund حقيقي في S3-01. إذا كانت سياسة لازمة غير معتمدة، لا نبدأ انتقالًا ماليًا يعتمد عليها؛ يمكن استكمال بنية/توثيق غير معتمدين عليها ضمن حدود Story معلنة.

## 4. تتبع الـStories — الحالات الأولية

الحالة هنا للعمل الجديد فقط؛ وجود تصميم في الخطة لا يعني وجود implementation.

| Story | الحالة عند التقسيم | معيار الخروج المختصر |
| --- | --- | --- |
| S3-01 | الإعداد المحلي مكتمل؛ team/Staging/capacity inputs مفتوحة منفصلة | 432 PASS + policy/ADRs/contracts/gaps/readiness؛ لا ادعاء قبول Staging |
| S3-02 | مكتملة محليًا؛ أساس داخلي فقط، دون HTTP/provider activation | 462 PASS + lint/OpenAPI؛ الفهارس وrollback/concurrency وفحص legacy؛ [الدليل](sprint_3_financial_foundation.md) |
| S3-03 | مكتملة محليًا؛ 484 PASS + lint/OpenAPI | directory/status + audit/session fencing؛ [الدليل](sprint_3_admin_users.md)؛ B01 Staging لم ينفّذ |
| S3-04 | مكتملة محليًا؛ 509 PASS + lint/OpenAPI | archive/access policy عبر جميع المسارات؛ [الدليل](sprint_3_course_access.md)؛ قبول B02 Staging لم ينفّذ |
| S3-05 | مكتملة محليًا؛ baseline 542 PASS + lint/OpenAPI؛ issuance مقفولة افتراضيًا | reservation/replay/hold/audit/provider boundary؛ [الدليل](sprint_3_refund_requests.md) |
| S3-06 | مكتملة محليًا؛ 577 PASS + lint/OpenAPI، 154.41 ثانية | signed events/recovery وatomic ledger/access؛ [الدليل](sprint_3_refund_finalization.md)؛ التفعيل وStaging منفصلان |
| S3-07 | مكتملة محليًا؛ 595 PASS + lint/OpenAPI، 191.18 ثانية | paid/free reentry مع retained progress وsource fences؛ [الدليل](sprint_3_repurchase.md)؛ B12 Staging منفصل |
| S3-08 | مكتملة محليًا؛ 627 PASS + lint/OpenAPI، 398.91 ثانية | dated eligibility/shared guard وsigned carry-forward؛ [الدليل](sprint_3_earnings_eligibility.md)؛ قبول Staging منفصل |
| S3-09 | رُفعت في `3ffb52a` | معاينة، حجز ذري وكشف موقّع واحتساب الدين. [دليل التشغيل](sprint_3_payout_drafts.md) |
| S3-10 | رُفعت في `3a169f5`؛ 639 PASS + lint/OpenAPI | ختم وتسوية وإلغاء موثق، مع حجز النتيجة غير المعروفة ومعالجة اعتماد الاسترداد. [دليل التشغيل](sprint_3_payout_lifecycle.md) |
| S3-11 | رُفعت في `7c0f321`؛ 643 PASS + lint/OpenAPI | المدرّس يرى مبيعاته وأرباحه وتسوياته فقط. [تعريفات التقرير](sprint_3_instructor_finance.md) |
| S3-12 | مكتملة محليًا؛ 646 PASS + lint/OpenAPI | مؤشرات الأدمن، إجماليات المنصة والمدرّس، ومراجع الطلب وسجل الاسترداد. [العقود](sprint_3_admin_finance.md) |
| S3-13 | لم تبدأ | candidate لا يعدّل live، ومعه عقود كاملة |
| S3-14 | لم تبدأ | approval/media/progress ذري ومتوافق |
| S3-15 | لم تبدأ | migration/restore/rollback/monitoring عليها دليل |
| S3-16 | لم تبدأ | كل قبول Staging المطلوب موثق؛ NOT RUN ليست PASS |
| S3-17 | لم تبدأ | العقد والأمثلة والـguides مطابقة للتنفيذ |
| S3-18 | جزئيًا منجزة قبل Sprint 3 | avatarUrl/counts/duration موجودة؛ مراجعة المتبقي والأدلة لا تزال مطلوبة |
| S3-19 | لم تبدأ المراجعة الشاملة الجديدة | permissions/privacy/security/performance gaps مقفولة |
| S3-20 | لم تبدأ | product sign-off لكل required scope وحزمة التسليم |

## 5. قواعد إكمال كل Story

تحديث S3-02 في 2026-11-18: أضيفت models/indexes وZod primitives وaudit/transaction
guards وحساب الأموال الدقيق وفحص legacy للقراءة فقط. اختبارات الـStory الثلاثون ناجحة،
والمراجعة الكاملة 462 PASS. لم تُفعّل سياسة مالية أو refund/payout workflow، ولم يحدث
commit/push. التالي S3-03، مع بقاء بوابات Staging والتشغيل مفتوحة.

تحديث S3-03: اكتمل directory/status workflow محليًا مع حماية الأدمن والجلسات والتدقيق،
وتحديث OpenAPI 1.1.0 وfrontend handoff. `npm run verify`: **484 PASS** دون fail/skip/
cancel، 156.85 ثانية. S3-01/S3-02 رُفعا سابقًا في `afaf965` بطلب المستخدم؛ تغييرات
S3-03 محلية دون commit/push. التالي **S3-04**؛ قبول Staging B01 ما زال مفتوحًا.

تحديث S3-04: اكتملت الأرشفة وسياسة الحظر المستقلة محليًا، مع توحيد الكتالوج/الشراء/
المكتبة/الوسائط/التقدم وتحديث OpenAPI 1.2.0 وhandoff. المراجعة الكاملة **509 PASS**
مع lint/OpenAPI، 145.79 ثانية. S3-03 رُفعت لاحقًا في `e6f9f5b` بطلب المستخدم؛ تغييرات
S3-04 محلية دون commit/push. التالي **S3-05**؛ B02 Staging لم ينفّذ.

تحديث S3-05: اكتملت العقود المحمية للطلب/القراءة وStripe adapter وreservation/hold/
audit/replay، مع تعطيل إصدار Stripe الفعلي لحين S3-06. المراجعة الكاملة **542 PASS**
مع lint/OpenAPI، 145.01 ثانية، دون fail/skip/cancel. OpenAPI 1.3.0 وhandoff محدثان.
S3-04/S3-05 رُفعا في commit `bedffc9`. تحديث لاحق: نُفّذ S3-06 محليًا للـreducer/events/recovery
وسياسة Checkout ووقت التأكيد الموثوق؛ [الدليل الحالي](sprint_3_refund_finalization.md).
S3-06 رُفعت في commit `e1314ff`. نُفّذت بعدها S3-07 محليًا لإعادة الشراء/التفعيل المجاني
المثبت، مع الاحتفاظ بالتقدّم وإضافة ملخص الاسترداد الآمن للطلبات؛ [الدليل](sprint_3_repurchase.md).
نُفّذت بعدها S3-08 محليًا للأهلية الموثقة والـholds والرصيد الموقّع؛ [الدليل](sprint_3_earnings_eligibility.md).
رُفعت S3-07/S3-08 في `b146dad` وS3-09 في `3ffb52a` وS3-10 في `3a169f5` وS3-11 في `7c0f321`. نُفّذت S3-12 محليًا والتالية **S3-13**. قبول Staging المالي ما زال مفتوحًا.

1. Models/indexes، أو بيان عدم الحاجة لموديل/فهرس جديد؛ Zod request validation.
2. Services/policies/adapters ثم controllers/routes/middlewares؛ لا provider call داخل transaction callback قابل للإعادة.
3. Unit وHTTP وreplica-set integration، مع ownership/concurrency/failure cases ذات الصلة.
4. OpenAPI للعمليات المنفّذة، frontend examples، تحديث README/runbook إن لزم.
5. Review و`npm run verify` ودليل النتيجة؛ ثم تتغير الحالة من In progress إلى Implemented locally، ويُفصل قبول Staging عنها.

لا push أو PR أو merge أو تعديل حساب مزود لمجرد أن Story انتهت؛ إجراءات النشر وGitHub تكون بتكليف المستخدم. لا نفترض أن كل Story تحتاج collection/controller/route جديدًا إذا كانت مجرد worker أو policy داخلية.

## 6. متى نعتبر Sprint 3 انتهى؟

عندما تتحقق Definition of Done في الخطة الأصلية: كل 32 requirement وظيفية و10 business rules و14 acceptance criteria وكل NFR ومتطلبات التسليم لها implementation ودليل وقبول. لا يُكتفى بنجاح الاختبارات المحلية أو بوصول الكود إلى GitHub، ولا تُرحّل وظيفة MVP أساسية إلى Sprint رابع.
