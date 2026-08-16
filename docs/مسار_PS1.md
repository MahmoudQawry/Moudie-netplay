# مسار PS1 في Moudie NetPlay

## القرار المبدئي

سيكون **PCSX ReARMed عبر LibretroDroid** هو المسار الأول للتشغيل المحلي على Android لأنه مهيأ لمعالجات ARM وARM64 ويضم مترجماً ديناميكياً لتلك المعماريات.[1] لا يعلن هذا المسار عن Netplay على مستوى core نفسه، لذلك لن يُسوَّق كجلسة PS1 متعددة اللاعبين قبل بناء مزامنة حالة وإدخال منفصلة واختبارها فعلياً.[2]

SwanStation خيار مرحلة لاحقة للحواسيب والهواتف القوية، لأنه يقدم مترجماً ديناميكياً لـARM وعارض OpenGL ES/Vulkan وميزات دقة محسنة، لكنه أثقل دمجاً من PCSX ReARMed للنسخة الأولى.[3]

## متطلبات المستخدم

سيختار المستخدم لعبة يملكها محلياً بصيغة مدعومة مثل `.cue` و`.bin` و`.chd` و`.pbp`، ولن يضم التطبيق ألعاباً أو BIOS مملوكاً.[2] يمكن أن يعمل PCSX ReARMed بوضع HLE عند غياب BIOS، لكن وثائقه تنبه إلى انخفاض التوافق؛ لذلك ستظهر شاشة إرشادية تطلب من المستخدم استيراد BIOS قانوني مستخرج من جهازه عند الحاجة.[2]

## المراحل العملية

| المرحلة | النتيجة |
|---|---|
| 1 | تضمين PCSX ReARMed core ووحدة LibretroDroid مع شاشة اختيار `.cue`/`.chd`/`.pbp` محلية. |
| 2 | إخراج صورة وصوت، أزرار PS1 رقمية، وبطاقات ذاكرة محلية. |
| 3 | اختبار BIOS اختياري وإظهار فحص التوافق بدون تنزيل أو توزيع ملفات BIOS. |
| 4 | تجميد حالة البداية وربط إدخال اللاعبين عبر قناة الغرفة ثم اختبار NetPlay على جهازين قبل إتاحته للمستخدمين. |

## بدء الدمج

يوفر LibretroDroid واجهة Android لمشغلات Libretro تشمل الصوت وإدخال أذرع التحكم وحفظ/استعادة الحالة، ويذكر PCSX ReARMed ضمن cores التي يدعمها؛ كما يعتمد Lemuroid عليه في دعم PlayStation على Android.[4] لذلك يبدأ الدمج بإضافة المكتبة إلى مشروع Android وجلب core متوافق مع ABI التطبيق، ثم بناء `SurfaceView`/وحدة Kotlin تستقبل ملف اللعبة المحلي وإدخال أزرار PS1. لن يدمج التطبيق ملف BIOS أو لعبة؛ سيظل هذا الاختيار محلياً لدى المستخدم.[2] [4]

## المراجع

[1] [PCSX ReARMed — GitHub](https://github.com/libretro/pcsx_rearmed)

[2] [PCSX ReARMed — Libretro Docs](https://docs.libretro.com/library/pcsx_rearmed/)

[3] [SwanStation — Libretro](https://github.com/libretro/swanstation)

[4] [LibretroDroid — GitHub](https://github.com/Swordfish90/LibretroDroid)
