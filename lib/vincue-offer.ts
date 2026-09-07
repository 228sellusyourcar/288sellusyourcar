import { isVinCueLeadId } from "./appraisal";

// A receipt is a continuation of the vendor workflow, not proof of an offer.
export function isVinCueOfferUrl(value: unknown, leadId: string): value is string {
  if (typeof value !== "string" || value.length > 3000 || !isVinCueLeadId(leadId)) return false;
  try {
    const url = new URL(value);
    if (url.origin !== "https://pro.vincue.com" || url.pathname !== "/buyingcenter/marketreport.aspx" || url.username || url.password || url.hash) return false;
    const allowed = new Set(["did", "leadid", "year", "mmid", "trimid", "vn", "key"]);
    for (const key of Array.from(url.searchParams.keys())) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return false;
    }
    return url.searchParams.get("did") === "24831" && url.searchParams.get("leadid") === leadId &&
      /^\d{4}$/.test(url.searchParams.get("year") || "") &&
      /^[1-9]\d*$/.test(url.searchParams.get("mmid") || "") &&
      /^[1-9]\d*$/.test(url.searchParams.get("trimid") || "");
  } catch { return false; }
}
