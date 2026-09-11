# كيفية بناء APK بعد إصلاحات PUBG

## المشكلة: لا يمكن بناء APK في بيئة Arena
بيئة Arena الحالية لا تحتوي على Android SDK أو Java، لذلك لا يمكن بناء APK مباشرة هنا.

## الحل 1: GitHub Actions (تلقائي) - الأسهل ✅

1. **ادمج الـ PR:**
   - اذهب إلى: https://github.com/MahmoudQawry/Classic-Era-by-Moudie-Netplay/pull/6
   - اضغط **Merge pull request** → **Confirm merge**

2. **انتظر البناء التلقائي:**
   - بعد الدمج، سيبدأ GitHub Actions تلقائياً في بناء APK
   - اذهب إلى: https://github.com/MahmoudQawry/Classic-Era-by-Moudie-Netplay/actions
   - ستجد workflow باسم **Build Android APK** يعمل
   - انتظر 15-20 دقيقة حتى ينتهي

3. **حمّل الـ APK:**
   - بعد انتهاء البناء، اضغط على الـ workflow
   - في الأسفل ستجد **Artifacts** → `classic-era-moudie-apk`
   - حمّل الملف وفك الضغط، ستجد `app-release.apk`

## الحل 2: بناء محلي على جهازك

### المتطلبات:
- Node.js 20+
- pnpm 9.12.0
- Java 17 (Temurin)
- Android Studio مع Android SDK
- Git

### الخطوات:

```bash
# 1. جلب الكود الجديد
git clone https://github.com/MahmoudQawry/Classic-Era-by-Moudie-Netplay.git
cd Classic-Era-by-Moudie-Netplay
git checkout arena/01a08e5e-classic-era-by-moudie-netplay
# أو بعد الدمج: git checkout main && git pull

# 2. تثبيت الحزم
pnpm install

# 3. تطبيق إصلاحات التحكم (مهم!)
python3 scripts/apply-native-multitouch-fix.py
python3 scripts/restore-connected-dpad-routing.py
python3 scripts/apply-universal-connected-dpad.py
python3 scripts/apply-famicom-connected-dpad.py
python3 scripts/fix-router-types.py

# 4. تضمين أنوية المحاكيات
chmod +x scripts/sync-libretro-cores.sh
INCLUDE_MAME=1 ./scripts/sync-libretro-cores.sh arm64-v8a

# 5. بناء Android
npx expo prebuild --platform android
python3 scripts/restore-plain-android-startup.py
chmod +x android/gradlew
cd android
./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=512m" -Dorg.gradle.daemon=false

# 6. الـ APK سيكون هنا:
# android/app/build/outputs/apk/release/app-release.apk
```

### للـ Debug APK (أسرع):
```bash
cd android
./gradlew assembleDebug
# المسار: android/app/build/outputs/apk/debug/app-debug.apk
```

## الحل 3: EAS Build (سحابي)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

## ما تم إصلاحه في هذا البناء:

### Server (PUBG-style):
- `frameTrackers`: يمنع جهاز من التقدم أكثر من 30 فريم
- `inputHistory` 60 فريم فقط + تنظيف تلقائي
- `delay negotiation` من 2 إلى 8 فريم حسب الشبكة
- `quality-probe` كل 600ms
- `rate limiting` 120 input/sec
- `voice team/room filtering`

### Kotlin (PS1 & Universal):
- `CORE_VERSION v2-pubg`, `interval 16ms`
- `MAX_PREDICTION 30` فريم - لا يتجمد، يتنبأ بحركة الخصم
- `JITTER_BUFFER 4` فريمات احتياط
- `RESYNC 5s` - إعادة مزامنة تلقائية بعد 5 ثواني
- `frameDriftMs` مع تعويض: 8ms إذا متأخر، 24ms إذا متقدم
- `sessionStartTimeMs` وقت بداية موحد

### Voice Chat (PUBG-style):
- TURN servers: `openrelay.metered.ca:80/443/TCP` + 4 STUN
- Audio: `echoCancellation, noiseSuppression, autoGainControl, 48kHz`
- PTT (اضغط لتتحدث) vs Open Mic
- Team channel (لللاعبين فقط) vs Room channel (للجميع)
- Speaking indicators مع auto-clear 2s
- DTX+RED + reconnect on failed

## اختبار على جهازين:

1. ثبّت نفس الـ APK على الجهازين
2. افتح نفس الغرفة، نفس اللعبة (SHA-256 يجب أن يتطابق)
3. اضغط Ready على الجهازين
4. المضيف يضغط Start Session
5. يجب أن يبدأ lockstep مستقر بدون desync
6. جرّب الصوت: PTT و Team/Room channels

## ملاحظات:

- الـ APK القديم في المجلد (`Classic-Era-by-Moudie-release.apk`) هو من قبل الإصلاحات - لا تستخدمه
- الـ APK الجديد بعد الإصلاحات سيكون بحجم ~60MB
- تأكد أن الجهازين على نفس إصدار `v2-pubg`

## رابط الـ PR:
https://github.com/MahmoudQawry/Classic-Era-by-Moudie-Netplay/pull/6
