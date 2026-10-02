import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";

export const WHATSAPP_NUMBER = "201000000000"; // رقم تجريبي

export type Property = {
  id: number;
  title: string;
  image: string;
  price: number;
  type: string;
  area: string;
  size: number;
  rooms?: number;
  baths?: number;
  status: "بيع" | "إيجار";
  updated: string;
};

export const TYPES = ["شقة", "فيلا", "أرض", "محل", "مكتب", "دوبلكس"];
export const AREAS = ["الحي الأول", "الحي الثاني", "الحي الثالث", "الحي الرابع", "الحي الخامس"];

export const properties: Property[] = [
  { id: 1, title: "شقة بإطلالة مفتوحة", image: p1, price: 1850000, type: "شقة", area: "الحي الأول", size: 135, rooms: 3, baths: 2, status: "بيع", updated: "2026-09-28" },
  { id: 2, title: "فيلا مستقلة بحمام سباحة", image: p2, price: 7200000, type: "فيلا", area: "الحي الثالث", size: 420, rooms: 5, baths: 4, status: "بيع", updated: "2026-09-25" },
  { id: 3, title: "دوبلكس بحديقة خاصة", image: p3, price: 12000, type: "دوبلكس", area: "الحي الخامس", size: 210, rooms: 4, baths: 3, status: "إيجار", updated: "2026-09-30" },
  { id: 4, title: "شقة مفروشة قريبة من الخدمات", image: p1, price: 6500, type: "شقة", area: "الحي الثاني", size: 110, rooms: 2, baths: 1, status: "إيجار", updated: "2026-09-20" },
  { id: 5, title: "محل تجاري على شارع رئيسي", image: p3, price: 950000, type: "محل", area: "الحي الرابع", size: 45, status: "بيع", updated: "2026-09-18" },
  { id: 6, title: "مكتب إداري بتشطيب كامل", image: p1, price: 8000, type: "مكتب", area: "الحي الثالث", size: 80, baths: 1, status: "إيجار", updated: "2026-09-22" },
];

export const brokers = [
  { name: "مكتب النخبة العقاري", initials: "ن", specialty: "شقق وفلل سكنية", areas: "الحي الأول، الحي الثاني" },
  { name: "أحمد سامي", initials: "أس", specialty: "أراضٍ ومشروعات استثمارية", areas: "المنطقة الصناعية، الحي الرابع" },
  { name: "دار الريادة للعقارات", initials: "ر", specialty: "محلات ومكاتب إدارية", areas: "المحور المركزي، الحي الثالث" },
];

export const formatPrice = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
export const formatDate = (d: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
