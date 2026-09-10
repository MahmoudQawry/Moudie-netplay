from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Path('/home/ubuntu/upload/Screenshot_2026-09-10-04-59-10-66_99c04817c0de5652397fc8b56c3b3817.webp')
if not source.exists():
    raise SystemExit(f'missing attached image: {source}')
img = Image.open(source).convert('RGB')
# The poster is portrait with black margins. Use the central artwork for launcher icons,
# while retaining the full poster as a splash/brand card.
w, h = img.size
side = min(w, int(h * 0.60))
top = max(0, int(h * 0.25))
if top + side > h: top = h - side
icon = img.crop((0, top, w, top + side)).resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(ROOT / 'assets/images/classic-era-new-icon.png', optimize=True)
card = img.resize((1024, 2278), Image.Resampling.LANCZOS)
card.save(ROOT / 'assets/images/classic-era-new-poster.png', optimize=True)

# Keep the checked-in native Android project aligned with app.config.ts. Expo does
# not regenerate these resources during a plain Gradle assemble, so update them
# deterministically for every density used by the APK.
for path in (ROOT / 'android/app/src/main/res').glob('mipmap-*/ic_launcher*.webp'):
    size = Image.open(path).size
    icon.resize(size, Image.Resampling.LANCZOS).save(path, 'WEBP', quality=96, method=6)
for path in (ROOT / 'android/app/src/main/res').glob('drawable-*/splashscreen_logo.png'):
    size = Image.open(path).size
    card.resize(size, Image.Resampling.LANCZOS).save(path, 'PNG', optimize=True)
print('created new brand assets')
