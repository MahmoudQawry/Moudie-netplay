from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Exact UI literals covered in the first localization pass. The script is intentionally
# deterministic and only edits files listed below; emulator protocol code is untouched.
files = {
    'app/create-room.tsx': {
        'import { useState } from "react";': 'import { useState } from "react";\nimport { useLanguage } from "@/lib/language";',
        '  const capacity = roomCapacityFor(system);': '  const capacity = roomCapacityFor(system);\n  const { t } = useLanguage();',
        'Alert.alert("Room name is too short", "Enter at least two characters.")': 'Alert.alert(t("nameShort"), t("nameShortText"))',
        'Alert.alert("Could not create room", error instanceof Error ? error.message : "Try again.")': 'Alert.alert(t("createRoomError"), error instanceof Error ? error.message : t("tryAgain"))',
        'isPublicLobby ? "HOST PUBLIC LOBBY" : "CREATE PRIVATE ROOM"': 'isPublicLobby ? t("hostPublicLobby") : t("createPrivateRoom")',
        '<Text style={styles.panelLead}>CHOOSE AN EMULATOR</Text>': '<Text style={styles.panelLead}>{t("chooseEmulator")}</Text>',
        '<Text style={styles.label}>DISPLAY NAME</Text>': '<Text style={styles.label}>{t("displayName")}</Text>',
        '<Text style={styles.featureText}>VOICE</Text>': '<Text style={styles.featureText}>{t("voiceShort")}</Text>',
        '<Text style={styles.featureText}>CHAT</Text>': '<Text style={styles.featureText}>{t("chatShort")}</Text>',
        '<Text style={styles.featureText}>SPECTATE</Text>': '<Text style={styles.featureText}>{t("spectateShort")}</Text>',
        'isPublicLobby ? "HOST PUBLIC LOBBY" : "CREATE ROOM & ENTER PLAYER"': 'isPublicLobby ? t("hostPublicLobby") : t("createRoomEnter")',
    },
    'app/join-room.tsx': {
        'import { useEffect, useState } from "react";': 'import { useEffect, useState } from "react";\nimport { useLanguage } from "@/lib/language";',
        '  const [joining, setJoining] = useState(false);': '  const [joining, setJoining] = useState(false);\n  const { t } = useLanguage();',
        'Alert.alert("Check the code", "A room code has six letters or numbers.")': 'Alert.alert(t("checkCode"), t("roomCodeLength"))',
        'Alert.alert("Add a display name", "Enter at least two characters for your room name.")': 'Alert.alert(t("addDisplayName"), t("nameShortText"))',
        'Alert.alert("Could not join", error instanceof Error ? error.message : "Check the room code and try again.")': 'Alert.alert(t("joinError"), error instanceof Error ? error.message : t("checkCodeAndRetry"))',
        '<Text style={styles.title}>JOIN PRIVATE ROOM</Text>': '<Text style={styles.title}>{t("joinPrivateRoom")}</Text>',
        '<Text style={styles.label}>ROOM CODE</Text>': '<Text style={styles.label}>{t("roomCode")}</Text>',
        '<Text style={styles.label}>DISPLAY NAME</Text>': '<Text style={styles.label}>{t("displayName")}</Text>',
        '<Text style={styles.label}>HOW DO YOU WANT TO JOIN?</Text>': '<Text style={styles.label}>{t("joinAs")}</Text>',
        '>PLAYER</Text>': '>{t("player")}</Text>',
        '>You control the game</Text>': '>{t("controlGame")}</Text>',
        '>SPECTATOR</Text>': '>{t("spectator")}</Text>',
        '>Watch, talk, and chat</Text>': '>{t("watchTalkChat")}</Text>',
        '>JOIN ROOM</Text>': '>{t("joinRoom")}</Text>',
        '>CREATE A PRIVATE ROOM FOR FRIENDS</Text>': '>{t("createPrivateForFriends")}</Text>',
    },
}

for rel, replacements in files.items():
    path = ROOT / rel
    text = path.read_text()
    for old, new in replacements.items():
        if old in text:
            text = text.replace(old, new)
        elif new not in text:
            raise SystemExit(f'missing expected text in {rel}: {old}')
    path.write_text(text)

print(f'localized {len(files)} UI files')

# Add missing keys once, preserving the compact dictionary style used by the project.
lang = ROOT / 'lib/language.tsx'
s = lang.read_text()
keys = {
 'en': {'createRoomError':'Could not create room','tryAgain':'Try again.','hostPublicLobby':'HOST PUBLIC LOBBY','createPrivateRoom':'CREATE PRIVATE ROOM','chooseEmulator':'CHOOSE AN EMULATOR','displayName':'DISPLAY NAME','voiceShort':'VOICE','chatShort':'CHAT','spectateShort':'SPECTATE','createRoomEnter':'CREATE ROOM & ENTER PLAYER','checkCode':'Check the code','roomCodeLength':'A room code has six letters or numbers.','addDisplayName':'Add a display name','joinError':'Could not join','checkCodeAndRetry':'Check the room code and try again.','joinPrivateRoom':'JOIN PRIVATE ROOM','roomCode':'ROOM CODE','joinAs':'HOW DO YOU WANT TO JOIN?','player':'PLAYER','controlGame':'You control the game','spectator':'SPECTATOR','watchTalkChat':'Watch, talk, and chat','joinRoom':'JOIN ROOM','createPrivateForFriends':'CREATE A PRIVATE ROOM FOR FRIENDS'},
 'ar': {'createRoomError':'تعذر إنشاء الغرفة','tryAgain':'حاول مرة أخرى.','hostPublicLobby':'استضافة الردهة العامة','createPrivateRoom':'إنشاء غرفة خاصة','chooseEmulator':'اختر محاكيًا','displayName':'الاسم الظاهر','voiceShort':'صوت','chatShort':'دردشة','spectateShort':'مشاهدة','createRoomEnter':'إنشاء الغرفة والدخول للعب','checkCode':'تحقق من الرمز','roomCodeLength':'رمز الغرفة يتكون من ستة أحرف أو أرقام.','addDisplayName':'أضف اسمًا ظاهرًا','joinError':'تعذر الانضمام','checkCodeAndRetry':'تحقق من رمز الغرفة وحاول مرة أخرى.','joinPrivateRoom':'الانضمام إلى غرفة خاصة','roomCode':'رمز الغرفة','joinAs':'كيف تريد الانضمام؟','player':'لاعب','controlGame':'تتحكم في اللعبة','spectator':'مشاهد','watchTalkChat':'شاهد وتحدث ودردش','joinRoom':'انضمام إلى الغرفة','createPrivateForFriends':'إنشاء غرفة خاصة للأصدقاء'},
 'fr': {'createRoomError':'Impossible de créer la salle','tryAgain':'Réessayez.','hostPublicLobby':'HÉBERGER LE LOBBY PUBLIC','createPrivateRoom':'CRÉER UNE SALLE PRIVÉE','chooseEmulator':'CHOISIR UN ÉMULATEUR','displayName':'NOM AFFICHÉ','voiceShort':'VOIX','chatShort':'CHAT','spectateShort':'SPECTATEUR','createRoomEnter':'CRÉER LA SALLE ET JOUER','checkCode':'Vérifiez le code','roomCodeLength':'Le code de salle contient six lettres ou chiffres.','addDisplayName':'Ajoutez un nom affiché','joinError':'Impossible de rejoindre','checkCodeAndRetry':'Vérifiez le code et réessayez.','joinPrivateRoom':'REJOINDRE UNE SALLE PRIVÉE','roomCode':'CODE DE SALLE','joinAs':'COMMENT REJOINDRE ?','player':'JOUEUR','controlGame':'Vous contrôlez le jeu','spectator':'SPECTATEUR','watchTalkChat':'Regarder, parler et discuter','joinRoom':'REJOINDRE LA SALLE','createPrivateForFriends':'CRÉER UNE SALLE PRIVÉE POUR AMIS'}
}
# Insert missing keys before the existing brandName key in each dictionary.
for locale, additions in keys.items():
    marker = 'brandName:'
    needle = f'  {locale}: {{'
    start = s.index(needle)
    pos = s.index(marker, start)
    payload = ', '.join(f'{k}:{v!r}' for k,v in additions.items()) + ', '
    # Convert Python quotes to valid TS double-quoted strings.
    payload = ', '.join(f'{k}:"{v.replace(chr(34), chr(92)+chr(34))}"' for k,v in additions.items()) + ', '
    s = s[:pos] + payload + s[pos:]
lang.write_text(s)
print('dictionary keys added')

# Scan used dictionary keys for parity after the edit.
