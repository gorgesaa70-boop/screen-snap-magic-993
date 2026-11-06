/**
 * Who gets a WhatsApp copy of a notification (release 48). New requests and inquiries reach the people responsible
 * for them — the account owner and managers, the assigned team member, the assigned Value Aqar employee — without
 * opting in first; anyone who saved WhatsApp settings keeps their choice (switch and ticked types). Admins get a copy only if they turned it on
 * (they'd otherwise get one for every request on the site). Other notification types stay opt-in.
 */
export const LEAD_TYPES = ["new_inquiry", "new_request"];

export function wantsWhatsapp(type: string, pref: { whatsapp_enabled: boolean; whatsapp_types: string[] } | null, isAdmin: boolean) {
  if (pref) return pref.whatsapp_enabled && pref.whatsapp_types.includes(type);
  return !isAdmin && LEAD_TYPES.includes(type);
}
