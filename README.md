# 🎮 Classic Era by Moudie — NetPlay

> **Old Equal Gold** — غرف لعب جماعي للألعاب الكلاسيكية: Famicom/NES، PlayStation 1، PSP، وSega Genesis.

**Classic Era by Moudie** تطبيق موبايل (أندرويد أولاً مع دعم ويب) يتيح للأصدقاء إنشاء غرف خاصة برمز دعوة للعب ألعاب المحاكاة الكلاسيكية عبر الإنترنت، مع دردشة نصية وصوتية داخل الغرفة.

**مبدأ أساسي:** التطبيق لا يوزّع ألعاباً ولا ملفات BIOS. كل لاعب يوفر ملف لعبته القانونية من جهازه، ويتحقق التطبيق من تطابق «بصمة الملف» بين جميع اللاعبين قبل بدء الجلسة.

## ✨ الميزات

- 🕹️ **أربعة أنظمة محاكاة**: Famicom/NES (FCEUmm) · PlayStation 1 (PCSX-ReARMed) · PSP (PPSSPP) · Sega Genesis (Genesis Plus GX)
- 🌍 **ثلاث لغات كاملة**: 🇪🇬 العربية · 🇺🇸 English · 🇫🇷 Français — تُطبَّق على جميع الشاشات دون اختلاط
- 🎙️ **صوت غرفة بأسلوب adaptive**: وضع «اضغط للتحدث» أو ميكروفون مفتوح، وقناة «الغرفة» (الجميع) أو «الفريق» (اللاعبون فقط)
- 💬 دردشة نصية داخل الغرفة
- 👥 حتى 8 أعضاء لكل غرفة (4 لاعبين + 4 مشاهدين — والمنس 2 + 6)
- 🔒 رموز دعوة مخزّنة SHA-256، تحقق Zod، تحديد معدل الطلبات، ومقاعد يحسبها الخادم ضد الانتحال
- 🔁 مزامنة save-states موثوقة عبر Socket.IO مع حاجز جلسة يمنع البدء قبل تطابق اللعبة والمحرك وجاهزية الجميع

## 🏗️ البنية التقنية

| الطبقة | التقنية |
|---|---|
| التطبيق | Expo 54 · React Native 0.81 · Expo Router · Nativewind/Tailwind |
| الخادم | Express · tRPC · Socket.IO (غرف + NetPlay عام) |
| قاعدة البيانات | MySQL عبر Drizzle ORM |
| الصوت | LiveKit (JWT قصير العمر) + قناة WebRTC مدمجة بديلة |
| المحاكاة الأصلية | وحدة Expo أصلية (Kotlin) + نوى Libretro (arm64) |

## 🚀 التشغيل

المتطلبات: Node.js 20+، pnpm 9، وقاعدة MySQL للخدمة السحابية.

```bash
pnpm install
cp infra/realtime/.env.example .env   # ثم عدّل DATABASE_URL وغيره
pnpm db:push                          # إنشاء ترحيلات قاعدة البيانات
pnpm dev                              # خادم + Metro معاً
```

أوامر مفيدة:

```bash
pnpm check    # فحص TypeScript
pnpm test     # اختبارات Vitest
pnpm lint     # ESLint
pnpm android  # بناء أندرويد
```

**نوى Libretro** تُجلب أثناء تجهيز أندرويد عبر `scripts/sync-libretro-cores.sh` — لا تُخزّن في المستودع.

## 🌐 متغيرات البيئة

راجع `infra/realtime/.env.example`. أهمها:

| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | رابط MySQL لخدمة الغرف |
| `ALLOWED_ORIGINS` | قائمة أصول ويب مسموحة مفصولة بفواصل (CORS)؛ اتركها فارغة في التطوير المحلي (localhost مسموح تلقائياً) |
| `LIVEKIT_URL` / مفاتيح LiveKit | لتفعيل صوت LiveKit؛ بدونه تُستخدم القناة المدمجة |

## 📄 الترخيص

MIT — راجع [LICENSE](LICENSE).

---
صُنع بحب لذكريات الطفولة 🕹️
