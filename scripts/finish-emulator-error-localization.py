from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
repls={
'app/ps1/[roomId].tsx': {
'new Error("PS1 game verification and room preparation are available in the Android APK only.")':'new Error(t("ps1AndroidOnly"))',
'new Error("PS1 NetPlay requires every active player (2–8) to select the same complete game file and core.")':'new Error(t("ps1NetplayNeedsPlayers"))',
'Alert.alert("Could not start the game", message)':'Alert.alert(t("startGameError"), message)',
},
'app/psp/[roomId].tsx': {
'new Error("Could not read the selected file.")':'new Error(t("unsupportedGameFile"))',
'new Error("Choose a PSP ISO, CSO, CHD, or PBP file.")':'new Error(t("choosePspFile"))',
'new Error("PSP room verification is available in the Android APK only.")':'new Error(t("pspAndroidOnly"))',
'new Error("PSP NetPlay needs an assigned player seat and a verified room session.")':'new Error(t("pspNetplayNeedsSeat"))',
},
'app/famicom/[roomId].tsx': {
'new Error("Could not read the game file from storage.")':'new Error(t("readGameError"))',
'new Error("Could not read the game file in the browser.")':'new Error(t("readBrowserGameError"))',
'new Error("Could not prepare the emulator screen.")':'new Error(t("prepareEmulatorError"))',
'new Error("Wait until the other player connects to the room channel.")':'new Error(t("waitOtherPlayer"))',
'new Error("The connection between both devices is not complete yet.")':'new Error(t("connectionIncomplete"))',
},
'app/native/[system]/[roomId].tsx': {
'new Error("Could not read the selected file.")':'new Error(t("unsupportedGameFile"))',
'new Error(`Choose a supported ${meta.title} file: ${catalog.acceptedExtensions.map((value) => `.${value}`).join(", ")}`)':'new Error(t("supportedGameFile") + ": " + meta.title + " (" + catalog.acceptedExtensions.map((value) => "." + value).join(", ") + ")")',
'new Error("Room verification is available in the Android APK only.")':'new Error(t("androidRoomOnly"))',
'new Error("This room needs an assigned player seat and a verified multiplayer session.")':'new Error(t("netplayNeedsSeat"))',
'Alert.alert(`${t("startGameError")}: ${meta.title}`, message)':'Alert.alert(t("startGameError") + `: ${meta.title}`, message)',
}
}
for rel, rs in repls.items():
 p=ROOT/rel; s=p.read_text()
 for a,b in rs.items(): s=s.replace(a,b)
 p.write_text(s)
vals={
'ps1NetplayNeedsPlayers':('PS1 NetPlay requires every active player (2–8) to select the same complete game file and core.','يتطلب PS1 NetPlay أن يختار جميع اللاعبين النشطين (2–8) ملف اللعبة والمحرك الكامل نفسيهما.','PS1 NetPlay exige que tous les joueurs actifs (2–8) sélectionnent le même fichier de jeu complet et le même cœur.'),
'pspNetplayNeedsSeat':('PSP NetPlay needs an assigned player seat and a verified room session.','يتطلب PSP NetPlay مقعد لاعب مخصصًا وجلسة غرفة تم التحقق منها.','PSP NetPlay nécessite un siège joueur attribué et une session vérifiée.'),
'readGameError':('Could not read the game file from storage.','تعذر قراءة ملف اللعبة من وحدة التخزين.','Impossible de lire le fichier de jeu depuis le stockage.'),
'readBrowserGameError':('Could not read the game file in the browser.','تعذر قراءة ملف اللعبة في المتصفح.','Impossible de lire le fichier de jeu dans le navigateur.'),
'prepareEmulatorError':('Could not prepare the emulator screen.','تعذر تجهيز شاشة المحاكي.','Impossible de préparer l’écran de l’émulateur.'),
'waitOtherPlayer':('Wait until the other player connects to the room channel.','انتظر حتى يتصل اللاعب الآخر بقناة الغرفة.','Attendez que l’autre joueur se connecte au canal de la salle.'),
'connectionIncomplete':('The connection between both devices is not complete yet.','لم يكتمل الاتصال بين الجهازين بعد.','La connexion entre les deux appareils n’est pas encore terminée.'),
'androidRoomOnly':('Room verification is available in the Android APK only.','يتوفر التحقق من الغرفة داخل تطبيق Android فقط.','La vérification de la salle est disponible uniquement dans l’APK Android.'),
'netplayNeedsSeat':('This room needs an assigned player seat and a verified multiplayer session.','تحتاج هذه الغرفة إلى مقعد لاعب مخصص وجلسة لعب جماعي تم التحقق منها.','Cette salle nécessite un siège joueur attribué et une session multijoueur vérifiée.'),
'supportedGameFile':('Choose a supported game file','اختر ملف لعبة مدعومًا','Choisissez un fichier de jeu pris en charge'),
}
p=ROOT/'lib/language.tsx'; s=p.read_text()
for loc,i in [('en',0),('ar',1),('fr',2)]:
 start=s.index(f'  {loc}: {{'); pos=s.index('brandName:',start); existing=s[start:pos]
 missing=', '.join(f'{k}:"{v[i].replace(chr(34), chr(92)+chr(34))}"' for k,v in vals.items() if f'{k}:' not in existing)
 if missing: s=s[:pos]+missing+', '+s[pos:]
p.write_text(s)
print('finished direct emulator error localization')
