/**
 * Privacy policy, terms of use and account-deletion page text (Arabic + English). Written to cover what the
 * App Store (5.1.1) and Google Play (User Data, Data safety, account deletion) ask a public policy to state.
 * Keep it in step with what the platform actually collects; update UPDATED when the text changes.
 */
export const LEGAL_UPDATED = "2026-10-11";
export const CONTACT_EMAIL = "info@valueaqar.com";
export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const PRIVACY: Record<"ar" | "en", LegalDoc> = {
  ar: {
    title: "سياسة الخصوصية",
    intro: "السياسة دي بتوضح إزاي فاليو عقار (الموقع valueaqar.com وتطبيق Value Aqar على أندرويد وiOS) بتجمع بياناتك وبتستخدمها وبتحميها، وإيه حقوقك. استخدامك للمنصة معناه إنك قريت السياسة دي.",
    sections: [
      { h: "1. البيانات اللي بنجمعها", p: [
        "بيانات الحساب: رقم الموبايل (وبنأكده بكود على واتساب أو رسالة نصية)، والإيميل لو استخدمته، والاسم وصورة الحساب الأساسية لو دخلت بحساب Google.",
        "البيانات اللي إنت بتبعتها: اسمك ورقمك وتفاصيل طلبك أو استفسارك (نوع العقار، المنطقة، الميزانية)، وبيانات العقار اللي بتعرضه وصوره، ومكانه على الخريطة لو اخترت تحدده.",
        "بيانات الوسطاء والشركات: اسم الشركة أو الوسيط، والتخصص والمناطق، وبيانات التواصل، والسجل التجاري، وأرقام أعضاء الفريق اللي بتضيفهم.",
        "نشاطك على المنصة: العقارات اللي حفظتها في المفضلة، وتنبيهات «نبّهني»، وإعدادات الإشعارات، وحالة طلباتك.",
        "بيانات تقنية: نوع المتصفح أو الجهاز، وتقارير الأعطال (رسالة الخطأ والصفحة اللي حصل فيها)، وعنوان الـ IP اللي بيسجله مزود الاستضافة لأغراض الأمان.",
        "مصدر الزيارة: لو دخلت من رابط إعلان، بنحفظ على جهازك لمدة 30 يوم اسم المصدر والحملة (زي utm_source وutm_campaign) عشان نعرف أنهي إعلان بيفيد. ده مش بيتشارك مع أي حد.",
        "التواصل معانا: لو بعتلنا على واتساب، بنستلم رقمك واسمك على واتساب ونص الرسالة. ولو مليت فورم إعلان على فيسبوك أو إنستجرام، بنستلم الإجابات اللي كتبتها فيه.",
        "الموقع الجغرافي: مش بنتتبع مكانك. بنستخدم مكانك بس لو دوست «موقعي الحالي» وإنت بتحدد مكان عقار، وبعد ما توافق من الجهاز.",
      ] },
      { h: "2. بنستخدم البيانات في إيه", p: [
        "إننا نشغّل المنصة: نعرض العقارات، ونوصّل طلبك أو استفسارك للوسيط أو الشركة المناسبة من خلال المنصة، ونتابع حالته.",
        "إننا نبعتلك إشعارات عن طلباتك والعقارات المطابقة لبحثك، جوه المنصة وعلى واتساب لو فعّلت ده (وتقدر تقفله في أي وقت).",
        "تأكيد رقمك وحماية الحسابات ومنع الاحتيال والإعلانات الوهمية.",
        "تحسين الخدمة وإصلاح الأعطال، ومعرفة الإعلانات اللي بتجيب عملاء.",
        "مش بنبيع بياناتك، ومش بنستخدمها في إعلانات جهات تانية، ومش بنستخدم أدوات تتبع إعلاني جوه التطبيق.",
      ] },
      { h: "3. مين بيشوف بياناتك", p: [
        "الوسيط أو الشركة اللي طلبك اتوجّه لها: بتشوف اسمك ورقمك وتفاصيل الطلب عشان تتواصل معاك بخصوصه.",
        "فريق فاليو عقار: لمتابعة الطلبات والمراجعة والدعم.",
        "مزودي خدمات بيشتغلوا لحسابنا وبس: الاستضافة وقاعدة البيانات (Lovable Cloud / Supabase)، ورسائل واتساب وإعلانات Lead Ads (Meta)، وتسجيل الدخول والخرائط (Google)، ومزود الرسائل النصية. كل واحد بيوصله اللي محتاجه بس عشان يقدم الخدمة.",
        "الجهات الرسمية: لو القانون طلب كده.",
        "بيانات تواصل الوسطاء والشركات مش بتظهر للعامة؛ التواصل بيتم من خلال المنصة.",
      ] },
      { h: "4. بنحتفظ بالبيانات لحد إمتى", p: [
        "بيانات حسابك طول ما الحساب موجود. لما تمسحه، بنمسح بياناتك الشخصية خلال 30 يوم بالكتير.",
        "الطلبات اللي اتبعتت لشركات، والصفقات والعمولات وسجل المراجعة، بنحتفظ بيها كسجلات تشغيل ومحاسبة لمدة لحد 5 سنين، من غير ما تكون مربوطة بحسابك بعد مسحه.",
        "تقارير الأعطال 30 يوم، وأكواد التأكيد دقايق لحد ما تُستخدم أو تنتهي.",
      ] },
      { h: "5. حقوقك", p: [
        "تقدر تشوف بياناتك وتعدلها من «حسابي» و«الملف الشخصي».",
        "تقدر توقف إشعارات واتساب من إعدادات الإشعارات.",
        "تقدر تمسح حسابك بنفسك في أي وقت: «حسابي» ← «امسح حسابي». ولو مش قادر تدخل، اطلب المسح من صفحة valueaqar.com/delete-account.",
        `لأي طلب تاني (نسخة من بياناتك، تصحيح، اعتراض) ابعتلنا على ${CONTACT_EMAIL}.`,
      ] },
      { h: "6. حماية البيانات", p: [
        "الاتصال مشفّر (HTTPS)، والصلاحيات متحددة جوه قاعدة البيانات نفسها بحيث كل حد يشوف اللي يخصه بس، والصور والمستندات محفوظة في مخازن خاصة مش متاحة للعامة.",
        "مفيش نظام آمن 100%، لكن بنراجع الصلاحيات باختبارات تلقائية مع كل تعديل.",
      ] },
      { h: "7. الأطفال", p: ["المنصة لأغراض عقارية ومش موجهة لأقل من 18 سنة، ومش بنجمع بيانات أطفال عن قصد. لو عرفت إن طفل بعت بيانات، كلّمنا ونمسحها."] },
      { h: "8. تغييرات على السياسة", p: ["لو غيّرنا حاجة مهمة هنبلغك جوه المنصة قبل ما تبدأ. تاريخ آخر تحديث مكتوب تحت."] },
      { h: "9. تواصل معانا", p: [`الإيميل: ${CONTACT_EMAIL} — أو راسلنا على واتساب من الزرار اللي تحت.`] },
    ],
  },
  en: {
    title: "Privacy Policy",
    intro: "This policy explains how Value Aqar (the website valueaqar.com and the Value Aqar app for Android and iOS) collects, uses and protects your data, and what your rights are. By using the platform you acknowledge this policy.",
    sections: [
      { h: "1. Data we collect", p: [
        "Account data: your mobile number (verified with a code by WhatsApp or SMS), your email if you use one, and your name and profile picture if you sign in with Google.",
        "Data you send: your name, phone and request or inquiry details (property type, area, budget), the property you list and its photos, and its map location if you choose to set it.",
        "Broker and company data: company or broker name, specialty and areas, contact details, commercial register, and the phone numbers of team members you add.",
        "Activity: saved favourites, “notify me” alerts, notification settings and the status of your requests.",
        "Technical data: browser or device type, error reports (the error message and page), and the IP address logged by our hosting provider for security.",
        "Visit source: if you arrive from an ad link, we store on your device for 30 days the source and campaign name (e.g. utm_source, utm_campaign) to learn which ads work. It is not shared with anyone.",
        "Contacting us: if you message us on WhatsApp we receive your number, WhatsApp name and message text. If you fill an ad form on Facebook or Instagram we receive the answers you entered.",
        "Location: we do not track your location. It is used only when you tap “my location” while pinning a property, after you allow it on your device.",
      ] },
      { h: "2. How we use data", p: [
        "To run the platform: show listings, route your request or inquiry to the right broker or company through the platform, and track its status.",
        "To send you notifications about your requests and matching listings, in the app and on WhatsApp if you enable it (you can turn it off at any time).",
        "To verify your number, secure accounts and prevent fraud and fake listings.",
        "To improve the service, fix errors and understand which ads bring customers.",
        "We do not sell your data, do not use it for third-party advertising, and do not use advertising trackers in the app.",
      ] },
      { h: "3. Who sees your data", p: [
        "The broker or company your request is routed to: your name, phone and request details, to contact you about it.",
        "The Value Aqar team: to follow up requests, review content and provide support.",
        "Service providers acting only for us: hosting and database (Lovable Cloud / Supabase), WhatsApp messaging and Lead Ads (Meta), sign-in and maps (Google), and the SMS provider — each receives only what it needs to provide the service.",
        "Authorities, when required by law.",
        "Brokers' and companies' contact details are not public; contact happens through the platform.",
      ] },
      { h: "4. How long we keep data", p: [
        "Account data for as long as the account exists. When you delete it, your personal data is removed within 30 days at most.",
        "Requests already sent to companies, deals, commissions and the audit trail are kept as operational and accounting records for up to 5 years, no longer linked to your deleted account.",
        "Error reports for 30 days; verification codes for minutes until used or expired.",
      ] },
      { h: "5. Your rights", p: [
        "View and edit your data from “My account” and “Profile”.",
        "Turn off WhatsApp notifications in notification settings.",
        "Delete your account yourself at any time: “My account” → “Delete my account”. If you cannot sign in, request deletion at valueaqar.com/delete-account.",
        `For any other request (a copy of your data, correction, objection) email ${CONTACT_EMAIL}.`,
      ] },
      { h: "6. Security", p: [
        "Connections are encrypted (HTTPS), access rules are enforced in the database itself so each person sees only what concerns them, and photos and documents are kept in private storage.",
        "No system is 100% secure, but access rules are checked by automated tests with every change.",
      ] },
      { h: "7. Children", p: ["The platform is for real-estate purposes and is not directed to anyone under 18; we do not knowingly collect children's data. If you learn that a child sent us data, contact us and we will delete it."] },
      { h: "8. Changes", p: ["If we make an important change we will tell you in the app before it applies. The last update date is shown below."] },
      { h: "9. Contact", p: [`Email: ${CONTACT_EMAIL} — or message us on WhatsApp with the button below.`] },
    ],
  },
};

export const TERMS: Record<"ar" | "en", LegalDoc> = {
  ar: {
    title: "شروط الاستخدام",
    intro: "الشروط دي بتنظم استخدامك لمنصة فاليو عقار (الموقع والتطبيق). باستخدامك للمنصة أو بتسجيل حساب، إنت موافق عليها. لو مش موافق، ماتستخدمش المنصة.",
    sections: [
      { h: "1. الخدمة", p: [
        "فاليو عقار منصة بتعرض عقارات للبيع والإيجار والمصيف ومشروعات ومولات وفرص استثمارية، وبتوصّل العملاء بالوسطاء وشركات التسويق والتطوير والملاك من خلالها.",
        "فاليو عقار مش طرف في عقد البيع أو الإيجار إلا لو اتفق على ده كتابة. الاتفاق النهائي بيكون بين العميل والطرف التاني.",
      ] },
      { h: "2. الحساب", p: [
        "لازم تكون 18 سنة أو أكتر، وبياناتك صحيحة ومحدّثة، والرقم بتاعك. إنت مسؤول عن أي استخدام لحسابك.",
        "حساب واحد لكل شخص أو شركة. أعضاء فريق الشركة بيدخلوا بأرقامهم جوه حساب الشركة.",
        "تقدر تمسح حسابك في أي وقت من «حسابي».",
      ] },
      { h: "3. العملاء", p: [
        "استخدام المنصة مجاني للعملاء.",
        "بيانات العقارات بيكتبها المعلنين. علامة «متحقق منه» معناها إن فريقنا عاين العقار في التاريخ المكتوب، ومش ضمان لحالته أو ملكيته بعد كده.",
        "اتأكد من الأوراق والملكية قبل أي دفع، وماتدفعش أي مبلغ قبل المعاينة والتأكد.",
      ] },
      { h: "4. الوسطاء والشركات والملاك", p: [
        "لازم يكون عندك حق عرض العقار، والبيانات والصور والأسعار حقيقية ومحدّثة، ومن غير تكرار.",
        "الإدارة بتراجع الإعلانات وليها حق تعدّل أو ترفض أو تخفي أي إعلان مخالف، وتوقف الحساب لو اتكررت المخالفة.",
        "العملاء اللي بيوصلوك من المنصة بيتسجلوا بمصدرهم وتاريخ إحالتهم. التعامل معاهم بيكون حسب اتفاقية العمولة بينك وبين فاليو عقار، ومحاولة تجاوز المنصة لتفادي العمولة مخالفة.",
        "عدد الإعلانات حسب باقتك.",
      ] },
      { h: "5. الفرص الاستثمارية", p: ["الأرقام والعوائد المعروضة تقديرية ومش نصيحة استثمارية ولا ضمان. على المستثمر عمل الفحص القانوني والفني والمالي قبل أي قرار."] },
      { h: "6. ممنوع", p: [
        "إعلانات وهمية أو مضللة، أو عقارات مش من حقك تعرضها.",
        "جمع بيانات المستخدمين أو التواصل معاهم برّه الغرض اللي اتبعتت عشانه، أو إزعاجهم.",
        "أي محاولة لاختراق المنصة أو تعطيلها أو تجاوز صلاحياتك.",
        "انتحال شخصية حد تاني، أو أي محتوى مخالف للقانون أو للآداب.",
      ] },
      { h: "7. المحتوى", p: ["بعرضك لمحتوى (صور، وصف) إنت بتدينا الحق نعرضه على المنصة ونستخدمه في الترويج للعقار نفسه، وإنت مسؤول عن إن عندك حق نشره. اسم وشعار فاليو عقار ملك لنا."] },
      { h: "8. التواصل والإشعارات", p: ["بتسجيلك بتوافق إننا نبعتلك أكواد التأكيد وإشعارات عن طلباتك ونشاطك بالرسائل النصية وواتساب، وتقدر توقف إشعارات واتساب من الإعدادات."] },
      { h: "9. حدود المسؤولية", p: ["بنقدم المنصة «زي ما هي» وبنحاول تكون شغالة ودقيقة، لكن مش مسؤولين عن صحة بيانات المعلنين أو عن الاتفاقات بين المستخدمين أو عن أي خسارة غير مباشرة، في حدود ما يسمح به القانون."] },
      { h: "10. الإيقاف", p: ["ليّنا حق نوقف أو نقفل أي حساب بيخالف الشروط دي، وليك حق تسيب المنصة وتمسح حسابك في أي وقت."] },
      { h: "11. التعديلات", p: ["ممكن نعدّل الشروط دي، ولو التعديل مهم هنبلغك جوه المنصة. استمرارك في الاستخدام بعد التعديل معناه إنك موافق."] },
      { h: "12. القانون", p: ["الشروط دي خاضعة لقوانين جمهورية مصر العربية، ومحاكم الإسكندرية هي المختصة بأي نزاع."] },
      { h: "13. تواصل معانا", p: [`الإيميل: ${CONTACT_EMAIL} — أو راسلنا على واتساب من الزرار اللي تحت.`] },
    ],
  },
  en: {
    title: "Terms of Use",
    intro: "These terms govern your use of the Value Aqar platform (website and app). By using the platform or creating an account you agree to them. If you do not agree, do not use the platform.",
    sections: [
      { h: "1. The service", p: [
        "Value Aqar is a platform listing properties for sale, rent and summer rental, projects, malls and investment opportunities, and connecting customers with brokers, marketing and development companies and owners through the platform.",
        "Value Aqar is not a party to any sale or lease unless agreed in writing. The final agreement is between the customer and the other party.",
      ] },
      { h: "2. Accounts", p: [
        "You must be 18 or older, keep your details accurate and current, and use your own number. You are responsible for any use of your account.",
        "One account per person or company. Company team members sign in with their own numbers inside the company account.",
        "You can delete your account at any time from “My account”.",
      ] },
      { h: "3. Customers", p: [
        "The platform is free for customers.",
        "Listing details are provided by advertisers. The “Verified” badge means our team inspected the property on the date shown; it is not a guarantee of its later condition or ownership.",
        "Check documents and ownership before any payment, and do not pay anything before viewing and verifying.",
      ] },
      { h: "4. Brokers, companies and owners", p: [
        "You must have the right to list the property; details, photos and prices must be real, current and not duplicated.",
        "The admins review listings and may edit, reject or hide any non-compliant listing, and suspend accounts for repeated violations.",
        "Customers who reach you through the platform are recorded with their source and referral date. Dealing with them follows your commission agreement with Value Aqar; bypassing the platform to avoid commission is a violation.",
        "The number of listings depends on your plan.",
      ] },
      { h: "5. Investment opportunities", p: ["Figures and returns shown are estimates, not investment advice or a guarantee. Investors must do their own legal, technical and financial due diligence before any decision."] },
      { h: "6. Not allowed", p: [
        "Fake or misleading listings, or properties you have no right to list.",
        "Collecting users' data or contacting them beyond the purpose it was sent for, or harassing them.",
        "Any attempt to hack, disrupt or exceed your access on the platform.",
        "Impersonation, or any unlawful or indecent content.",
      ] },
      { h: "7. Content", p: ["By posting content (photos, descriptions) you grant us the right to display it on the platform and use it to promote that property, and you are responsible for having the right to publish it. The Value Aqar name and logo are ours."] },
      { h: "8. Communications", p: ["By signing up you agree to receive verification codes and notifications about your requests and activity by SMS and WhatsApp; you can turn off WhatsApp notifications in settings."] },
      { h: "9. Liability", p: ["The platform is provided “as is”. We work to keep it available and accurate, but we are not responsible for advertisers' information, agreements between users, or indirect losses, to the extent permitted by law."] },
      { h: "10. Suspension", p: ["We may suspend or close accounts that break these terms; you may leave and delete your account at any time."] },
      { h: "11. Changes", p: ["We may update these terms and will tell you in the app about important changes. Continuing to use the platform after a change means you accept it."] },
      { h: "12. Law", p: ["These terms are governed by the laws of the Arab Republic of Egypt, and the courts of Alexandria have jurisdiction over any dispute."] },
      { h: "13. Contact", p: [`Email: ${CONTACT_EMAIL} — or message us on WhatsApp with the button below.`] },
    ],
  },
};

export const DELETION: Record<"ar" | "en", LegalDoc> = {
  ar: {
    title: "مسح الحساب",
    intro: "تقدر تمسح حسابك على فاليو عقار وبياناتك الشخصية في أي وقت.",
    sections: [
      { h: "من جوه التطبيق أو الموقع", p: ["سجّل دخولك ← «حسابي» ← «امسح حسابي» ← اكتب «امسح» للتأكيد. الحساب بيتمسح على طول."] },
      { h: "لو مش قادر تدخل", p: [`ابعتلنا من رقم الموبايل المسجّل على واتساب (الزرار اللي تحت) أو على ${CONTACT_EMAIL} واكتب «عايز أمسح حسابي». هنتأكد إن الرقم بتاعك ونمسحه خلال 7 أيام.`] },
      { h: "إيه اللي بيتمسح", p: [
        "الحساب وتسجيل الدخول، والمفضلة، وتنبيهات «نبّهني»، والإشعارات وإعداداتها، وبيانات المستثمر، وطلبات الاستثمار اللي لسه بتتراجع.",
        "لحسابات الوسطاء والشركات: الملف بيختفي من الموقع ومعاه العقارات، وبيانات التواصل بتتمسح.",
      ] },
      { h: "إيه اللي بنحتفظ بيه", p: ["الطلبات اللي اتبعتت لشركات قبل كده، والصفقات والعمولات وسجل المراجعة، بتفضل كسجلات تشغيل ومحاسبة لمدة لحد 5 سنين من غير ربط بحسابك. تقارير الأعطال بتتمسح لوحدها بعد 30 يوم."] },
    ],
  },
  en: {
    title: "Delete your account",
    intro: "You can delete your Value Aqar account and personal data at any time.",
    sections: [
      { h: "In the app or website", p: ["Sign in → “My account” → “Delete my account” → type the confirmation word. The account is deleted immediately."] },
      { h: "If you can't sign in", p: [`Message us from your registered mobile number on WhatsApp (button below) or email ${CONTACT_EMAIL} with “Delete my account”. We verify the number is yours and delete it within 7 days.`] },
      { h: "What is deleted", p: [
        "Your account and sign-in, favourites, “notify me” alerts, notifications and their settings, investor profile, and investment requests still under review.",
        "For broker and company accounts: the profile and its listings disappear from the site and contact details are erased.",
      ] },
      { h: "What we keep", p: ["Requests already sent to companies, deals, commissions and the audit trail remain as operational and accounting records for up to 5 years, no longer linked to your account. Error reports are removed automatically after 30 days."] },
    ],
  },
};
