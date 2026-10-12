# أيقونة فاليو عقار (دبوس المكان والبيت)

ملفات المصدر لأيقونة التطبيق، بالألوان الرسمية: كحلي `#1F2B4D` ومينت `#6CCBB0`.

| الملف | الاستخدام |
|---|---|
| `icon.png` (1024×1024) | أيقونة App Store وGoogle Play — مربع كامل من غير زوايا (المتاجر بتدوّرها) |
| `icon-foreground.png` + `icon-background.png` | أيقونة أندرويد المتغيرة (العلامة جوه منطقة الأمان) |
| `splash-icon.png` | شاشة الفتح |
| `icon.svg` | النسخة الأصلية القابلة للتكبير |

لما نبني تطبيقات أندرويد وiOS بـ Capacitor، الأمر ده بيطلّع كل المقاسات من الفولدر ده:

```
npx @capacitor/assets generate --iconBackgroundColor "#6CCBB0" --splashBackgroundColor "#FFFFFF"
```

أيقونات الموقع في `public/`: `favicon.svg` و`favicon-32.png` و`favicon.png` (التبويب)، `apple-touch-icon.png` (شاشة الآيفون)، `icon-192.png` و`icon-512.png` و`icon-maskable-512.png` (أندرويد، عن طريق `site.webmanifest`).
