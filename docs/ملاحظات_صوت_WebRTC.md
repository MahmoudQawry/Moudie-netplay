# ملاحظات الصوت المباشر عبر WebRTC

يحتاج الصوت المباشر بين الهاتفين إلى قناة WebRTC وإشارات اتصال (offer/answer/ICE) تمر عبر خادم الغرفة. لا يدعم Expo Go مكتبة `react-native-webrtc` لأنها تتضمن كوداً أصلياً، لكن التطبيق الحالي يُبنى محلياً كـAPK ويقبل إضافتها مع config plugin وإعادة البناء.[1]

توصي وثائق `react-native-webrtc` باستخدام `react-native-webrtc` للتواصل الصوتي أو المرئي على Android، مع دعم معماريات Android الشائعة.[1] وتوضح وثائق config plugin أن التثبيت في Expo يتم عبر `react-native-webrtc` و`@config-plugins/react-native-webrtc` ثم إضافته إلى `app.config.ts` وإعادة البناء.[2]

## المراجع

[1] [React Native WebRTC — GitHub](https://github.com/react-native-webrtc/react-native-webrtc)

[2] [Config plugin for react-native-webrtc — npm](https://www.npmjs.com/package/@config-plugins/react-native-webrtc)

[3] [React Native InCall Manager — npm](https://www.npmjs.com/package/react-native-incall-manager)

يمكن لـ `react-native-incall-manager` إدارة مسار الصوت أثناء مكالمة React Native WebRTC، بما في ذلك تشغيل/إيقاف إدارة المكالمة، وتغيير مخرج السماعة، وكتم المسار الصوتي. يدعم Android API 24 فما أعلى، وهو متوافق مع حد التطبيق الأدنى الحالي.[3]

تشير وثائق Android لـ `react-native-webrtc` إلى أن دعم Bluetooth يتطلب أذونات `BLUETOOTH` و`BLUETOOTH_ADMIN` للإصدارات حتى Android 11، و`BLUETOOTH_CONNECT` للإصدارات الأحدث، إلى جانب أذونات الشبكة والصوت الأساسية.[4] كما أن WebRTC يعامل الصوت كمكالمة افتراضياً، ولذلك لا ينبغي فرض مخرج مكبر الصوت عند بدء الجلسة؛ يجب ترك Android يختار جهاز Bluetooth عند توفره أو اختيار مكبر الصوت فقط بطلب المستخدم.[3] [4]

[4] [React Native WebRTC — Android installation](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/AndroidInstallation.md)
