# لوجو وأيقونات فاليو عقار

المصدر: لوحة البراند `brand-sheet.jpg` (1600×800): دبوس المكان والبيت بالأخضر والكحلي، والكلام "VALUE عقار".

| الملف | الاستخدام |
|---|---|
| `icon.png` (1024×1024) | أيقونة App Store وGoogle Play (مربع كامل؛ المتاجر بتدوّره) |
| `icon-foreground.png` + `icon-background.png` | أيقونة أندرويد المتغيرة |
| `splash-icon.png` | شاشة فتح التطبيق |

في الموقع (`public/`):
- `logo-mark.png`: العلامة على خلفية بيضا، للهيدر. وجنبها الاسم كامل كنص: "فاليو عقار" و"VALUE AQAR".
- `logo-mark-dark.png`: أيقونة التطبيق الكحلي، لآخر الصفحة.
- `favicon-32.png` و`favicon.png` للتبويب، و`apple-touch-icon.png` لشاشة الآيفون، و`icon-192/512` و`icon-maskable-512` لأندرويد (من خلال `site.webmanifest`).

⚠️ لوحة البراند صغيرة، فأيقونة الـ 1024 متكبّرة من حوالي 280 بكسل، وده كويس للشاشة بس **قبل الرفع على المتاجر محتاجين الأيقونة الأصلية بجودة عالية** (1024 أو أكبر، ويفضل SVG). ساعتها نشغّل:

```
npx @capacitor/assets generate --iconBackgroundColor "#02162E" --splashBackgroundColor "#02162E"
```
