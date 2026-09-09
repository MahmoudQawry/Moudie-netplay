from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
files = [ROOT/'app/famicom/[roomId].tsx', ROOT/'app/ps1/[roomId].tsx', ROOT/'app/psp/[roomId].tsx', ROOT/'app/native/[system]/[roomId].tsx']
repls = {
    '>SEND</Text>': '>{t("send")}</Text>',
    '>ROOM CHAT</Text>': '>{t("roomChat")}</Text>',
    'placeholder="Write a message…"': 'placeholder={t("writeMessage")}',
    'placeholder="Message…"': 'placeholder={t("writeMessage")}',
    '"Could not mark ready"': 't("readyError")',
    '"Try again."': 't("tryAgain")',
}
for p in files:
    s=p.read_text()
    # Add the hook import once, after the first local import block.
    if 'import { useLanguage } from "@/lib/language";' not in s:
        anchor='import { ScreenContainer } from "@/components/screen-container";'
        if anchor not in s:
            anchor='import { useState' # native fallback; expected to be found in import line
            idx=s.find(anchor)
            if idx < 0: raise SystemExit(f'cannot find import anchor: {p}')
            s=s[:idx]+'import { useLanguage } from "@/lib/language";\n'+s[idx:]
        else:
            s=s.replace(anchor, anchor+'\nimport { useLanguage } from "@/lib/language";', 1)
    # Add hook after function opening, only if absent.
    if 'const { t } = useLanguage();' not in s:
        marker='export default function '
        start=s.find(marker)
        brace=s.find('{', start)
        s=s[:brace+1]+'\n  const { t } = useLanguage();'+s[brace+1:]
    for old,new in repls.items(): s=s.replace(old,new)
    p.write_text(s)
# Add the two shared keys to each locale only if absent.
lang=ROOT/'lib/language.tsx'; s=lang.read_text()
add={
'en': {'readyError':'Could not mark ready'},
'ar': {'readyError':'تعذر تأكيد الجاهزية'},
'fr': {'readyError':'Impossible de confirmer la préparation'},
}
for loc, vals in add.items():
    start=s.index(f'  {loc}: {{'); pos=s.index('brandName:',start)
    for k,v in vals.items():
        if f'{k}:' not in s[start:pos]: s=s[:pos]+f'{k}:"{v}", '+s[pos:]
lang.write_text(s)
print('localized shared emulator controls')
