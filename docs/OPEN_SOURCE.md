# Moudie NetPlay — Open Source Notice

Moudie NetPlay is being prepared as an open-source Android application. This notice records the intended third-party integration path; it must be reviewed and completed before a public binary is distributed.

## Planned native runtime

The Android runtime is designed to use LibretroDroid as an Android frontend library and separately packaged libretro cores. LibretroDroid is distributed under **GPL-3.0**. Its source and license are available at:

- https://github.com/Swordfish90/LibretroDroid
- https://github.com/Swordfish90/LibretroDroid/blob/master/LICENSE

The planned cores are Famicom/NES, Sega, PS1, and PSP. Each core must retain its own copyright and license notice. The exact core versions and corresponding source URLs must be recorded in this file before release.

## Distribution rule

Moudie NetPlay does not include ROM files, game images, or BIOS files. Players import files they are legally entitled to use from their own devices. The room service must never upload or redistribute those files.

Before publishing an APK or AAB that contains a GPL component, the release checklist must include the complete applicable license texts, copyright notices, corresponding source availability, and a clear attribution screen inside the application. This document is a working notice, not a substitute for legal review.
