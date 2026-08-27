#!/usr/bin/env python3
"""Keep the Android activity free of Expo's pre-draw splash gate after prebuild.

The project deliberately uses the plain ReactActivity startup path because the
generated SplashScreenManager pre-draw listener can retain the Android logo
when React Native is delayed on a physical device.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
activity_path = root / "android/app/src/main/java/com/app/moudienetplay/MainActivity.kt"
text = activity_path.read_text(encoding="utf-8")

text = text.replace("import expo.modules.splashscreen.SplashScreenManager\n\n", "")
text = re.sub(
    r"\n\s*// @generated begin expo-splashscreen .*?\n"
    r"\s*SplashScreenManager\.registerOnActivity\(this\)\n"
    r"\s*// @generated end expo-splashscreen\n",
    "\n",
    text,
    count=1,
)
text = text.replace("      SplashScreenManager.registerOnActivity(this)\n", "")

if "SplashScreenManager.registerOnActivity" in text:
    raise SystemExit("Could not remove Expo's generated SplashScreenManager gate.")
if "super.onCreate(null)" not in text:
    raise SystemExit("Plain Expo startup path is missing from MainActivity.")

activity_path.write_text(text, encoding="utf-8")
print("Restored the plain Android startup path after Expo prebuild.")
