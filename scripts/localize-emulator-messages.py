from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / 'app/famicom/[roomId].tsx',
    ROOT / 'app/ps1/[roomId].tsx',
    ROOT / 'app/psp/[roomId].tsx',
    ROOT / 'app/native/[system]/[roomId].tsx',
]

messages = {
    'unsupportedFile': {
        'en': 'Unsupported file', 'ar': 'ملف غير مدعوم', 'fr': 'Fichier non pris en charge'
    },
    'chooseFamicomFile': {
        'en': 'Choose a legal Famicom game with the .nes extension.', 'ar': 'اختر لعبة Famicom قانونية بامتداد .nes.', 'fr': 'Choisissez un jeu Famicom légal avec l’extension .nes.'
    },
    'choosePs1File': {
        'en': 'Choose a complete PS1 .bin, .iso, .chd, or .pbp file. A CUE file is not selected here because it needs its companion BIN file.', 'ar': 'اختر ملف PS1 كاملًا بامتداد .bin أو .iso أو .chd أو .pbp. لا يتم اختيار ملف CUE وحده لأنه يحتاج إلى ملف BIN المصاحب.', 'fr': 'Choisissez un fichier PS1 complet .bin, .iso, .chd ou .pbp. Un fichier CUE seul n’est pas accepté car il nécessite son fichier BIN associé.'
    },
    'choosePspFile': {
        'en': 'Choose a PSP ISO, CSO, CHD, or PBP file.', 'ar': 'اختر ملف PSP بامتداد ISO أو CSO أو CHD أو PBP.', 'fr': 'Choisissez un fichier PSP ISO, CSO, CHD ou PBP.'
    },
    'unsupportedGameFile': {
        'en': 'Could not read the selected file.', 'ar': 'تعذر قراءة الملف المحدد.', 'fr': 'Impossible de lire le fichier sélectionné.'
    },
    'androidRequired': {
        'en': 'Android APK required', 'ar': 'يلزم استخدام تطبيق Android', 'fr': 'APK Android requis'
    },
    'ps1AndroidOnly': {
        'en': 'The native PS1 player runs in the Android APK and is not available in the web preview.', 'ar': 'يعمل مشغل PS1 الأصلي داخل تطبيق Android ولا يتوفر في المعاينة على الويب.', 'fr': 'Le lecteur PS1 natif fonctionne dans l’APK Android et n’est pas disponible dans l’aperçu web.'
    },
    'pspAndroidOnly': {
        'en': 'The native PSP player is available in the Android APK only.', 'ar': 'يتوفر مشغل PSP الأصلي داخل تطبيق Android فقط.', 'fr': 'Le lecteur PSP natif est disponible uniquement dans l’APK Android.'
    },
    'biosAndroidOnly': {
        'en': 'Local BIOS checking and installation are available in the Android APK only.', 'ar': 'يتوفر فحص BIOS وتثبيته محليًا داخل تطبيق Android فقط.', 'fr': 'La vérification et l’installation locale du BIOS sont disponibles uniquement dans l’APK Android.'
    },
    'biosAdded': {
        'en': 'BIOS added', 'ar': 'تمت إضافة BIOS', 'fr': 'BIOS ajouté'
    },
    'biosStored': {
        'en': 'The BIOS file was stored locally in the app. It is never uploaded or shared.', 'ar': 'تم حفظ ملف BIOS محليًا داخل التطبيق، ولا يتم رفعه أو مشاركته مطلقًا.', 'fr': 'Le fichier BIOS a été enregistré localement dans l’application. Il n’est jamais envoyé ni partagé.'
    },
    'biosAddError': {
        'en': 'Could not add BIOS', 'ar': 'تعذر إضافة BIOS', 'fr': 'Impossible d’ajouter le BIOS'
    },
    'biosLegalDump': {
        'en': 'Choose a legal dump with a supported name.', 'ar': 'اختر نسخة قانونية باسم مدعوم.', 'fr': 'Choisissez une copie légale avec un nom pris en charge.'
    },
    'chooseFileError': {
        'en': 'Could not choose the file', 'ar': 'تعذر اختيار الملف', 'fr': 'Impossible de choisir le fichier'
    },
    'chooseGameError': {
        'en': 'Could not choose game', 'ar': 'تعذر اختيار اللعبة', 'fr': 'Impossible de choisir le jeu'
    },
    'choosePspGameError': {
        'en': 'Could not choose PSP game', 'ar': 'تعذر اختيار لعبة PSP', 'fr': 'Impossible de choisir le jeu PSP'
    },
    'startGameError': {
        'en': 'Could not start the game', 'ar': 'تعذر تشغيل اللعبة', 'fr': 'Impossible de démarrer le jeu'
    },
    'startPspError': {
        'en': 'Could not start PSP', 'ar': 'تعذر تشغيل PSP', 'fr': 'Impossible de démarrer la PSP'
    },
    'startPs1Error': {
        'en': 'Could not start the PS1 player', 'ar': 'تعذر تشغيل مشغل PS1', 'fr': 'Impossible de démarrer le lecteur PS1'
    },
    'ps1GameError': {
        'en': 'Try again and choose a game file from storage.', 'ar': 'حاول مرة أخرى واختر ملف لعبة من وحدة التخزين.', 'fr': 'Réessayez et choisissez un fichier de jeu dans le stockage.'
    },
    'famicomGameError': {
        'en': 'Try another Famicom game file.', 'ar': 'جرّب ملف لعبة Famicom آخر.', 'fr': 'Essayez un autre fichier de jeu Famicom.'
    },
    'noSavedState': {
        'en': 'No saved state', 'ar': 'لا توجد حالة محفوظة', 'fr': 'Aucun état sauvegardé'
    },
    'noSavedStateText': {
        'en': 'Start the game, then tap Local Save to create a save state for this game.', 'ar': 'شغّل اللعبة ثم اضغط حفظ محلي لإنشاء حالة محفوظة لهذه اللعبة.', 'fr': 'Démarrez le jeu, puis appuyez sur Sauvegarde locale pour créer un état sauvegardé.'
    },
    'focusModeError': {
        'en': 'Could not open focus mode', 'ar': 'تعذر فتح وضع التركيز', 'fr': 'Impossible d’ouvrir le mode focus'
    },
    'sessionStartError': {
        'en': 'The session did not start', 'ar': 'لم تبدأ الجلسة', 'fr': 'La session n’a pas démarré'
    },
    'waitPlayersReady': {
        'en': 'Wait until both players are ready.', 'ar': 'انتظر حتى يصبح اللاعبان جاهزين.', 'fr': 'Attendez que les deux joueurs soient prêts.'
    },
}

# Only replace exact user-facing literals; protocol strings and technical identifiers remain unchanged.
replacements = {
    'Alert.alert("Unsupported file", "Choose a legal Famicom game with the .nes extension.")': 'Alert.alert(t("unsupportedFile"), t("chooseFamicomFile"))',
    'Alert.alert("Unsupported file", "Choose a complete PS1 .bin, .iso, .chd, or .pbp file. A CUE file is not selected here because it needs its companion BIN file.")': 'Alert.alert(t("unsupportedFile"), t("choosePs1File"))',
    'Alert.alert("Could not choose the file", error instanceof Error ? error.message : "Try again and choose a game file from storage.")': 'Alert.alert(t("chooseFileError"), error instanceof Error ? error.message : t("ps1GameError"))',
    'Alert.alert("Android APK required", "The native PS1 player runs in the Android APK and is not available in the web preview.")': 'Alert.alert(t("androidRequired"), t("ps1AndroidOnly"))',
    'Alert.alert("Android APK required", "Local BIOS checking and installation are available in the Android APK only.")': 'Alert.alert(t("androidRequired"), t("biosAndroidOnly"))',
    'Alert.alert("BIOS added", "The BIOS file was stored locally in the app. It is never uploaded or shared.")': 'Alert.alert(t("biosAdded"), t("biosStored"))',
    'Alert.alert("Could not add BIOS", error instanceof Error ? error.message : "Choose a legal dump with a supported name.")': 'Alert.alert(t("biosAddError"), error instanceof Error ? error.message : t("biosLegalDump"))',
    'Alert.alert("Could not open focus mode", message)': 'Alert.alert(t("focusModeError"), message)',
    'Alert.alert("The session did not start", error instanceof Error ? error.message : "Wait until both players are ready.")': 'Alert.alert(t("sessionStartError"), error instanceof Error ? error.message : t("waitPlayersReady"))',
    'Alert.alert("Could not choose PSP game", error instanceof Error ? error.message : t("tryAgain"))': 'Alert.alert(t("choosePspGameError"), error instanceof Error ? error.message : t("tryAgain"))',
    'Alert.alert("Android APK required", "The native PSP player is available in the Android APK only.")': 'Alert.alert(t("androidRequired"), t("pspAndroidOnly"))',
    'Alert.alert("Could not start PSP", message)': 'Alert.alert(t("startPspError"), message)',
    'Alert.alert("Could not choose game", message)': 'Alert.alert(t("chooseGameError"), message)',
    'Alert.alert(`Could not start ${meta.title}`, message)': 'Alert.alert(`${t("startGameError")}: ${meta.title}`, message)',
    'Alert.alert("No saved state", "Start the game, then tap Local Save to create a save state for this game.")': 'Alert.alert(t("noSavedState"), t("noSavedStateText"))',
    'Alert.alert("Could not start the game", error instanceof Error ? error.message : "Try another Famicom game file.")': 'Alert.alert(t("startGameError"), error instanceof Error ? error.message : t("famicomGameError"))',
}

for path in TARGETS:
    text = path.read_text()
    for old, new in replacements.items():
        text = text.replace(old, new)
    path.write_text(text)

lang = ROOT / 'lib/language.tsx'
s = lang.read_text()
for locale in ('en', 'ar', 'fr'):
    start = s.index(f'  {locale}: {{')
    pos = s.index('brandName:', start)
    additions = ', '.join(f'{key}:"{value[locale].replace(chr(34), chr(92)+chr(34))}"' for key, value in messages.items())
    # Avoid duplicate keys if the script is rerun.
    existing = s[start:pos]
    missing = ', '.join(f'{key}:"{messages[key][locale].replace(chr(34), chr(92)+chr(34))}"' for key in messages if f'{key}:' not in existing)
    if missing:
        s = s[:pos] + missing + ', ' + s[pos:]
lang.write_text(s)
print('localized emulator file/BIOS/error messages')
