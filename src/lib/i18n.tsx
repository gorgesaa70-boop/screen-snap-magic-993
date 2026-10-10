import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

/** Module-level current language so non-hook helpers (formatPrice, maps) can read it. */
let currentLang: Lang = "ar";
export const getLang = (): Lang => currentLang;

/** English dictionary keyed by the Arabic source string. Untranslated strings fall back to the Arabic source. */
const EN: Record<string, string> = {
  // Navbar / general
  "الرئيسية": "Home",
  "العقارات": "Properties",
  "خريطة العقارات": "Properties Map",
  "المصانع والأراضي الصناعية": "Factories & Industrial Land",
  "المولات": "Malls",
  "الوسطاء العقاريون": "Real Estate Brokers",
  "اطلب عقارك": "Request a Property",
  "دخول الوسطاء": "Broker Login",
  "أضف عقارك": "Add Your Property",
  "البحث": "Search",
  "القائمة": "Menu",
  "بحث": "Search",
  "الوسطاء": "Brokers",
  "تنقل سريع": "Quick links",
  "فاليو عقار": "Value Aqar",

  // Brokers, auth, map
  "{n} وسيط": "{n} brokers",
  "العقارات المسجلة ({n})": "Listed properties ({n})",
  "{n} عقار على الخريطة — اضغط على العلامة لعرض التفاصيل.": "{n} properties on the map — tap a pin for details.",
  "تسجيل الدخول": "Sign in",
  "للوسطاء والإدارة. عملاء جدد؟ سجّل برقمك وقدّم طلب انضمام.": "For brokers and admins. New here? Sign up with your number and request to join.",
  "البريد الإلكتروني": "Email",
  "نسيت رقم الهاتف أو تم تغييره؟": "Lost or changed your phone number?",
  "1. سجّل الدخول بالبريد الإلكتروني المسجّل في حسابك (أو أعد تعيين كلمة المرور منه).": "1. Sign in with the email on your account (or reset your password from it).",
  "2. من صفحة «حسابي» أضف الرقم الجديد وأكّده برمز يصل إليه.": "2. From “My account”, add the new number and confirm it with the code sent to it.",
  "إذا لم يكن لديك بريد مسجّل، تتحقق الإدارة من هويتك وملكية الحساب قبل أي تعديل، ثم يجب تأكيد الرقم الجديد برمز تحقق. التواصل وحده لا يكفي لنقل الحساب.": "Without an email on file, the admins verify your identity and account ownership first, and the new number must still be confirmed with a code. Contacting us alone is not enough to move an account.",
  "كلمة المرور": "Password",
  "إرسال رابط إعادة التعيين": "Send reset link",
  "نسيت كلمة المرور؟": "Forgot password?",
  "رجوع لتسجيل الدخول": "Back to sign in",
  "إعداد حساب المدير لأول مرة": "First-time admin setup",
  "رقم الهاتف الجديد": "New phone number",
  "مفتاح الدولة + الرقم": "Country code + number",
  "رسالة نصية": "SMS",
  "سنرسل رمز تحقق من 6 أرقام عبر {c}. الرمز صالح لمدة 5 دقائق.": "We'll send a 6-digit code via {c}. It's valid for 5 minutes.",
  "إرسال رمز التحقق": "Send code",
  "أدخل الرمز المرسل إلى": "Enter the code sent to",
  "صلاحية الرمز:": "Code valid for:",
  "انتهت صلاحية الرمز": "Code expired",
  "المحاولات:": "Attempts:",
  "جارٍ التحقق...": "Verifying...",
  "تأكيد": "Confirm",
  "تغيير الرقم": "Change number",

  // Property page
  "، ": ", ",

  // Sell your property (/sell)
  "بيع عقارك": "Sell your property",
  "عندك شقة أو أرض أو محل وعايز تبيعه أو تأجّره؟ ابعت البيانات، وفريق فاليو عقار هيتواصل معاك ويساعدك توصل للمشتري المناسب.": "Have an apartment, land or shop to sell or rent? Send us the details and the Value Aqar team will contact you and help you reach the right buyer.",
  "مجانًا بدون رسوم عرض": "Free, no listing fees",
  "بياناتك مش بتظهر للعامة": "Your details stay private",
  "نوصّلك بعملاء جادين": "We connect you with serious buyers",
  "عايز": "I want to",
  "أبيع": "Sell",
  "أأجّر": "Rent out",
  "اختر": "Choose",
  "المساحة (م²)": "Size (m²)",
  "السعر المطلوب (ج.م)": "Asking price (EGP)",
  "الإيجار الشهري (ج.م)": "Monthly rent (EGP)",
  "اختياري": "Optional",
  "الدور، التشطيب، عدد الغرف...": "Floor, finishing, rooms...",
  "رقم الموبايل (واتساب)": "Mobile number (WhatsApp)",
  "ابعت بيانات العقار": "Send property details",
  "هنبعتلك رمز تحقق على واتساب للتأكد من رقمك. رقمك مش هيظهر لحد غير فريق فاليو عقار.": "We will send a WhatsApp code to confirm your number. Only the Value Aqar team will see it.",
  "اكتب اسمك": "Enter your name",
  "اكتب رقم موبايل مصري صحيح": "Enter a valid Egyptian mobile number",
  "اختر نوع العقار": "Choose the property type",
  "بعتنالك رمز من 6 أرقام على واتساب للرقم": "We sent a 6-digit WhatsApp code to",
  "رمز التحقق": "Verification code",
  "تأكيد وإرسال": "Confirm & send",
  "إعادة الإرسال بعد": "Resend in",
  "إعادة إرسال الرمز": "Resend code",
  "تعديل البيانات": "Edit details",
  "تم استلام عقارك ✓": "We received your property ✓",
  "فريق فاليو عقار هيراجع البيانات ويتواصل معاك على واتساب قريب.": "The Value Aqar team will review it and contact you on WhatsApp soon.",
  "الرجوع للرئيسية": "Back to home",
  "متبقٍ": "remaining",
  "انتظر قليلًا قبل طلب رمز جديد": "Please wait before requesting a new code",
  "تجاوزت عدد مرات الإرسال المسموح، حاول لاحقًا": "Too many attempts, try again later",
  "تعذّر إرسال الرسالة عبر واتساب، تأكد أن الرقم مسجّل على واتساب": "Could not send the WhatsApp message. Make sure the number is on WhatsApp",
  "أدخل رمز التحقق المرسل على واتساب": "Enter the code sent on WhatsApp",
  "انتهت صلاحية الرمز، اطلب رمزًا جديدًا": "The code expired, request a new one",
  "تم إيقاف الرمز بعد محاولات كثيرة، اطلب رمزًا جديدًا": "Code locked after too many attempts, request a new one",
  "رمز غير صحيح": "Wrong code",

  // Hero / search form
  "برج العرب الجديدة": "New Borg El Arab",
  "عقارك المناسب،": "Your ideal property,",
  "أقرب": "closer",
  " مما تتخيل": " than you think",
  "اكتشف العقارات المتاحة في برج العرب، وقارن الخيارات، وتواصل مع الوسيط المناسب بكل سهولة.":
    "Explore available properties in Borg El Arab, compare your options, and easily reach the right broker.",
  "مجمع سكني حديث في برج العرب الجديدة": "Modern residential compound in New Borg El Arab",
  "نوع العقار": "Property type",
  "الغرض": "Purpose",
  "المدينة": "City",
  "المنطقة / الحي": "Area / District",
  "السعر من (ج.م)": "Min price (EGP)",
  "إلى (ج.م)": "Max (EGP)",
  "الكل": "All",
  "كل المدن": "All cities",
  "كل المناطق": "All areas",
  "ابحث عن عقار": "Search properties",
  "مسح": "Reset",
  "بلا حد": "No limit",

  // Property values
  "شقة": "Apartment",
  "فيلا": "Villa",
  "أرض": "Land",
  "محل": "Shop",
  "مكتب": "Office",
  "دوبلكس": "Duplex",
  "بيع": "Sale",
  "إيجار": "Rent",
  "لل": "For ",
  "ج.م": "EGP",
  " / شهريًا": " / month",
  "غرف": "rooms",
  "حمام": "baths",
  "م²": "sqm",

  // Cities & areas
  "كينج مريوط": "King Mariout",
  "مدينة العلمين": "New Alamein",
  "الساحل الشمالي": "North Coast",
  "الحي الأول": "First District",
  "الحي الثاني": "Second District",
  "الحي الثالث": "Third District",
  "الحي الرابع": "Fourth District",
  "الحي الخامس": "Fifth District",
  "الحي السادس": "Sixth District",
  "الحي السابع": "Seventh District",
  "الحي الثامن": "Eighth District",
  "الحي التاسع": "Ninth District",
  "العلمين الجديدة": "New Alamein",
  "الحي اللاتيني": "Latin District",
  "داون تاون": "Downtown",
  "الأبراج الشاطئية": "Beach Towers",
  "الحي السكني": "Residential District",

  // Account labels
  "وسيط عقاري": "Real estate broker",
  "مكتب عقاري": "Real estate office",
  "مالك العقار": "Property owner",

  // Categories / featured
  "تصفّح حسب النوع": "Browse by type",
  "التصنيفات الرئيسية": "Main Categories",
  "شقق": "Apartments",
  "فلل": "Villas",
  "أراضٍ": "Land",
  "محلات تجارية": "Commercial Shops",
  "مكاتب إدارية": "Administrative Offices",
  "عقارات للإيجار": "Properties for Rent",
  "مختارات فاليو عقار": "Value Aqar Picks",
  "العقارات المميزة": "Featured Properties",
  "نتائج البحث": "Search Results",
  "العقارات المطابقة": "Matching Properties",
  "تم العثور على": "Found",
  "عقار": "property",
  "عقارات": "properties",
  "مسح الفلاتر": "Clear filters",
  "تعذّر تحميل العقارات، حاول تحديث الصفحة.": "Couldn't load properties, try refreshing the page.",
  "لا توجد عقارات تطابق بحثك": "No properties match your search",
  "جرّب توسيع نطاق السعر أو اختيار منطقة أو نوع مختلف، أو اطلب عقارك وسنساعدك.":
    "Try widening the price range or picking a different area or type, or request a property and we'll help you.",
  "* العقارات التي تحمل علامة «إعلان تجريبي» بيانات توضيحية فقط.": "* Listings marked 'demo' are sample data only.",
  "إعلان تجريبي": "Demo listing",
  "مميز": "Featured",
  "لم يتم التحقق بعد": "Not verified yet",
  "تمت مراجعته": "Reviewed",
  "تحديث:": "Updated:",
  "تفاصيل العقار": "View details",
  "واتساب": "WhatsApp",
  "مرحبًا، أستفسر عن:": "Hello, I'm inquiring about:",

  // Request CTA
  "مش لاقي العقار اللي بتدور عليه؟": "Can't find the property you're looking for?",
  "حدد مواصفات العقار وميزانيتك، وسيقوم فريق فاليو عقار بمساعدتك في الوصول إلى الخيارات المناسبة.":
    "Tell us the property specs and your budget, and the Value Aqar team will help you reach the right options.",
  "تم استلام طلبك ✓": "Request received ✓",
  "سيتواصل معك أحد وسطائنا قريبًا.": "One of our brokers will contact you soon.",
  "الاسم": "Name",
  "رقم الهاتف": "Phone number",
  "المنطقة": "Area",
  "الميزانية (ج.م)": "Budget (EGP)",
  "تفاصيل إضافية": "Additional details",
  "جارٍ الإرسال...": "Sending...",
  "أرسل طلبك": "Send request",
  "اكتب الاسم ورقم هاتف صحيح": "Enter a valid name and phone number",
  "تعذّر إرسال الطلب، حاول مرة أخرى": "Couldn't send the request, please try again",

  // Brokers
  "شركاء موثوقون": "Trusted partners",
  "تواصل مع الوسيط المناسب": "Reach the right broker",
  "كل الوسطاء ←": "All brokers →",
  "عرض الملف الشخصي": "View profile",
  "دليل فاليو عقار": "Value Aqar Directory",
  "اختر الوسيط المناسب حسب المنطقة والتخصص وتواصل معه مباشرة.":
    "Pick the right broker by area and specialty and contact them directly.",
  "ابحث بالاسم أو التخصص": "Search by name or specialty",
  "وسيط": "broker",
  "وسطاء": "brokers",
  "لا يوجد وسطاء مطابقون": "No matching brokers",
  "بيانات تجريبية": "Demo data",
  "* بيانات تجريبية.": "* Demo data.",
  "عرض الملف ←": "View profile →",
  "عرض الملف": "View profile",
  "الوسيط غير موجود": "Broker not found",
  "كل الوسطاء ": "All brokers",
  "نبذة تعريفية": "About",
  "لم يضف الوسيط نبذة بعد.": "The broker hasn't added a bio yet.",
  "فيسبوك": "Facebook",
  "اتصال": "Call",
  "العقارات المسجلة": "Registered properties",
  "لا توجد عقارات معتمدة لهذا الوسيط حاليًا.": "No approved properties for this broker yet.",
  "مرحبًا {name}، تواصلت معك عبر فاليو عقار": "Hello {name}, I contacted you via Value Aqar",

  // For brokers / services
  "للوسطاء والمكاتب العقارية": "For brokers and real estate offices",
  "كبّر نشاطك العقاري مع فاليو عقار": "Grow your real estate business with Value Aqar",
  "أدوات تسويق وإدارة تساعدك في الوصول إلى عملاء جدد وتنظيم عقاراتك واستفساراتك.":
    "Marketing and management tools that help you reach new clients and organize your listings and inquiries.",
  "تسويق عقاراتك": "Market your properties",
  "إدارة الاستفسارات": "Manage inquiries",
  "متابعة الأداء": "Track performance",

  // Footer
  "منصة عقارية تربطك بالعقارات والوسطاء في برج العرب الجديدة.":
    "A real estate platform connecting you with properties and brokers in New Borg El Arab.",
  "روابط": "Links",
  "تواصل معنا": "Contact us",
  "برج العرب الجديدة، الإسكندرية": "New Borg El Arab, Alexandria",
  "صفحتنا على فيسبوك": "Our Facebook page",
  "حسابنا على إنستاجرام": "Our Instagram account",
  "حسابنا على تيك توك": "Our TikTok account",
  "تواصل معنا على واتساب": "Chat with us on WhatsApp",
  "مرحبًا، أريد الاستفسار عن أحد العقارات على منصة فاليو عقار.":
    "Hello, I'd like to inquire about a property on the Value Aqar platform.",
  "فاليو عقار. جميع الحقوق محفوظة.": "Value Aqar. All rights reserved.",
  "سياسة الخصوصية": "Privacy Policy",
  "الشروط والأحكام": "Terms & Conditions",

  // Map page / map component
  "اضغط على أي علامة لعرض السعر وفتح تفاصيل العقار.": "Tap any marker to see the price and open the property details.",
  "لا توجد عقارات محدد موقعها على الخريطة بعد": "No properties with map locations yet",
  "تصفح كل العقارات": "Browse all properties",
  "عقار بدون موقع محدد لا يظهر على الخريطة.": "property without a location isn't shown on the map.",
  "تعذّر تحميل الخريطة حاليًا. تأكد من الاتصال أو من إعداد مفتاح الخرائط.":
    "Couldn't load the map right now. Check your connection or the Maps key setup.",
  "عقار على الخريطة — اضغط على العلامة لعرض التفاصيل.": "properties on the map — tap a marker for details.",
  "عرض التفاصيل": "View details",

  // Industrial
  "أراضٍ صناعية ومصانع ومبانٍ صناعية للبيع والإيجار في المناطق الصناعية.":
    "Industrial land, factories and industrial buildings for sale and rent in industrial zones.",
  "بحث سريع بالاسم أو الموقع...": "Quick search by name or location...",
  "بحث سريع": "Quick search",
  "كل الأنواع": "All types",
  "كل الأنشطة": "All activities",
  "بيع وإيجار": "Sale & rent",
  "للبيع": "For Sale",
  "للإيجار": "For Rent",
  "أقل مساحة م²": "Min area (sqm)",
  "أكبر مساحة م²": "Max area (sqm)",
  "أقل سعر": "Min price",
  "أعلى سعر": "Max price",
  "جارٍ التحميل...": "Loading...",
  "تعذّر تحميل العقارات.": "Couldn't load properties.",
  "لا توجد نتائج مطابقة": "No matching results",
  "لا توجد عقارات صناعية منشورة بعد": "No industrial properties published yet",
  "أرض صناعية": "Industrial land",
  "مصنع مبنى بالكامل": "Fully built factory",
  "جزء من مصنع أو مبنى صناعي": "Part of a factory or industrial building",
  "مباني": "Built-up",
  "كل العقارات الصناعية": "All industrial properties",
  "مساحة الأرض": "Land area",
  "المساحة المبنية": "Built-up area",
  "الموقع التفصيلي:": "Detailed location:",
  "الوسيط المسؤول": "Listing broker",
  "العقار غير متاح": "Property unavailable",
  "العقار الصناعي غير متاح": "Industrial property unavailable",

  // Malls
  "المولات التجارية": "Commercial Malls",
  "اختر المول لعرض الوحدات المتاحة للبيع أو الإيجار.": "Choose a mall to view its units for sale or rent.",
  "لا توجد مولات بعد.": "No malls yet.",
  "المول غير متاح": "Mall unavailable",
  "كل المولات": "All malls",
  "كل الوحدات": "All units",
  "وحدة": "unit",
  "وحدات": "units",
  "متاحة": "available",
  "نوع الوحدة": "Unit type",
  "لا توجد وحدات متاحة حاليًا في هذا المول.": "No units available in this mall right now.",
  "استفسر واتساب": "Inquire on WhatsApp",
  "محل تجاري": "Commercial shop",
  "عيادة": "Clinic",
  "مطعم / كافيه": "Restaurant / Café",
  "كشك": "Kiosk",

  // Property detail
  "الموقع على الخريطة": "Location on map",
  "موقع العقار على الخريطة": "Property location on the map",
  "لا يوجد وصف إضافي.": "No additional description.",
  "عرض التفاصيل من المصدر": "View details at source",
  "آخر تحديث:": "Last updated:",
  "تواصل واتساب": "Contact via WhatsApp",
  "أرسل استفسارًا": "Send an inquiry",
  "رسالتك (اختياري)": "Your message (optional)",
  "إرسال الاستفسار": "Send inquiry",
  "تم إرسال استفسارك للوسيط ✓": "Your inquiry was sent to the broker ✓",
  "تعذّر الإرسال": "Couldn't send",

  // Notifications
  "الإشعارات": "Notifications",
  "غير مقروء": "unread",
  "تحديد الكل كمقروء": "Mark all as read",
  "لا توجد إشعارات": "No notifications",
  "عرض كل الإشعارات": "View all notifications",
  "تحديد كمقروء": "Mark as read",
  "حذف الإشعار": "Delete notification",
  "حذف": "Delete",
};

/** Translate a string (or data value like a property type) into the current language. */
export function t(s: string, vars?: Record<string, string | number>): string {
  let out = currentLang === "en" ? (EN[s] ?? s) : s;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; dir: "rtl" | "ltr" }>({ lang: "ar", setLang: () => {}, dir: "rtl" });
export const useLang = () => useContext(LangCtx);

const STORAGE_KEY = "va-lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  // Set during render (not in an effect) so t() returns the new language in this same render pass.
  currentLang = lang;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "ar") setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  // Persist only on an explicit switch: writing from the effect above could overwrite the saved choice before it is restored.
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  };

  return <LangCtx.Provider value={{ lang, setLang, dir: lang === "ar" ? "rtl" : "ltr" }}>{children}</LangCtx.Provider>;
}
