import "server-only";
import { load } from "cheerio";
import { isVinCueOfferUrl } from "./vincue-offer";
import { CookieJar } from "tough-cookie";
import { isVinCueLeadId, type AppraisalLead } from "./appraisal";

export type VinCueReceipt = { leadId: string; offerUrl: string };
export type VinCueTrimChoice = { id: number; name: string };
export type VinCueFailure = "vehicle_selection_required" | "integration_unavailable" | "submission_rejected" | "submission_unknown";
export class VinCueSubmissionError extends Error {
  constructor(public readonly code: VinCueFailure, public readonly choices?: VinCueTrimChoice[]) { super(code); }
}
const ORIGIN = "https://pro.vincue.com";
const DEALER = "24831";
const SOURCE_PAGE = "https://288sellusyourcar1.vercel.app/";
const CONTACT = "/buyingcenter/contact.aspx";
function requireState(ok: unknown): asserts ok {
  if (!ok) throw new VinCueSubmissionError("integration_unavailable");
}
async function readBounded(response: Response) {
  requireState(response.body);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 256 * 1024) { await reader.cancel(); requireState(false); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

async function lookupMatches(vin: string, year: string, get: (url: URL) => Promise<string>) {
const lookup = new URL("/buyingcenter/aj/vehicleAutoComplete.aspx", ORIGIN);
lookup.searchParams.set("q", vin);
const matches: unknown = JSON.parse(await get(lookup));
// Validate every option before asking the customer to resolve ambiguity.
requireState(Array.isArray(matches) && matches.length > 0 && matches.length <= 30);
for (const candidate of matches) {
  requireState(candidate && typeof candidate === "object");
  requireState(Number.isSafeInteger(candidate.mmid) && candidate.mmid > 0);
  requireState(Number.isSafeInteger(candidate.trimid) && candidate.trimid > 0);
  requireState(String(candidate.year) === year);
  requireState(typeof candidate.vehicleName === "string" && candidate.vehicleName.length > 0 && candidate.vehicleName.length < 300);
}
requireState(new Set(matches.map(candidate => candidate.trimid)).size === matches.length);
  return matches as { mmid: number; trimid: number; year: number; vehicleName: string }[];
}

// Read-only lookup for vehicle confirmation. This function cannot submit leads.
export async function getVinCueTrimChoices(vin: string, year: string, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<VinCueTrimChoice[]> {
  const signal = AbortSignal.timeout(12000);
  const matches = await lookupMatches(vin, year, async url => {
    const response = await fetcher(url, { redirect: "manual", cache: "no-store", signal, headers: { Accept: "application/json" } });
    requireState(response.status === 200);
    return readBounded(response);
  });
  return matches.map(match => ({ id: match.trimid, name: match.vehicleName }));
}

// Fetch injection is exclusively for offline tests. No URL/state is accepted
// from callers. Each invocation owns a fresh cookie jar and fresh form state.
export function createVinCueSubmit(fetcher: typeof fetch = (...args) => fetch(...args)) {
  return async (lead: AppraisalLead): Promise<VinCueReceipt> => {
    let postStarted = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    const jar = new CookieJar();
    const get = async (url: URL) => {
      const cookie = await jar.getCookieString(url.href);
      const response = await fetcher(url, {
        redirect: "manual", cache: "no-store", signal: controller.signal,
        headers: { Accept: "text/html, application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
      requireState(response.status === 200);
      for (const value of response.headers.getSetCookie()) await jar.setCookie(value, url.href);
      return readBounded(response);
    };
    try {
      const matches = await lookupMatches(lead.vehicle.vin, lead.vehicle.year, get);
      const match = lead.vinCueTrimId === undefined
        ? (matches.length === 1 ? matches[0] : undefined)
        : matches.find(candidate => candidate.trimid === lead.vinCueTrimId);
      if (!match) {
        throw new VinCueSubmissionError("vehicle_selection_required", matches.map(candidate => ({ id: candidate.trimid, name: candidate.vehicleName })));
      }
      const url = new URL(CONTACT, ORIGIN);
      url.search = new URLSearchParams({ did: DEALER, vin: lead.vehicle.vin,
        year: lead.vehicle.year, vn: match.vehicleName, mmid: String(match.mmid), trimid: String(match.trimid),
        // These are widget workflow inputs, not transient tracking tokens.
        // Let VinCue generate the matching protected hidden state itself.
        r: SOURCE_PAGE, followdealer: "0", forceLeadType: "-1" }).toString();
      const $ = load(await get(url));
      const form = $("form#theform");
      requireState(form.length === 1 && form.attr("method")?.toLowerCase() === "post" && form.attr("action"));
      const action = new URL(form.attr("action")!, url);
      requireState(action.origin === ORIGIN && action.pathname === CONTACT && !action.username && !action.password);
      requireState(action.searchParams.getAll("did").length === 1 && action.searchParams.get("did") === DEALER);
      const body = new URLSearchParams();
      form.find('input[type="hidden"]:not([disabled])').each((_, el) => {
        const name = $(el).attr("name");
        requireState(name && !body.has(name));
        body.set(name, $(el).attr("value") || "");
      });
      requireState(body.get("__VIEWSTATE") && body.get("__VIEWSTATEGENERATOR"));
      for (const [suffix, expected] of [["$tehDealerid$_inputhidden", DEALER], ["$thvin$_inputhidden", lead.vehicle.vin], ["$threfer$_inputhidden", SOURCE_PAGE], ["$TableEditHidden1$_inputhidden", "0"], ["$theforceleadtype$_inputhidden", "-1"]]) {
        const values = Array.from(body.entries()).filter(([name]) => name.endsWith(suffix)).map(([, value]) => value);
        requireState(values.length === 1 && values[0] === expected);
      }
      const [first, ...last] = lead.contact.fullName.split(/\s+/);
      requireState(first && last.length && lead.contact.email);
      for (const [cls, value] of [["lead-first-name", first], ["lead-last-name", last.join(" ")],
        ["lead-phone", lead.contact.phone], ["lead-email", lead.contact.email], ["lead-odometer", String(lead.mileage)]]) {
        const input = form.find(`input.${cls}:not([disabled])`);
        const name = input.attr("name");
        requireState(input.length === 1 && name && !body.has(name));
        const max = input.attr("maxlength");
        requireState(!max || value.length <= Number(max));
        body.set(name, value);
      }
      const year = form.find("select.yearselector:not([disabled])");
      const yearName = year.attr("name");
      requireState(year.length === 1 && yearName && !body.has(yearName));
      requireState(year.find("option").toArray().some(el => $(el).attr("value") === lead.vehicle.year));
      body.set(yearName, lead.vehicle.year);
      // Refuse new required fields, CAPTCHA, or unknown postback contracts.
      requireState(form.find('input[type="file"], .g-recaptcha, .h-captcha, .cf-turnstile').length === 0);
      form.find("[required]:not([disabled])").each((_, el) => {
        requireState(body.has($(el).attr("name") || ""));
      });
      const button = form.find("a#submitBtn");
      const event = /^javascript:__doPostBack\('([A-Za-z0-9_$]+)','(save:)'\)$/.exec(button.attr("href") || "");
      requireState(button.length === 1 && event && event[1].endsWith("$teLeadFormSubmitLead"));
      body.set("__EVENTTARGET", event[1]);
      body.set("__EVENTARGUMENT", event[2]);
      // Unchecked marketing opt-in controls are deliberately omitted.
      const cookie = await jar.getCookieString(action.href);
      postStarted = true;
      const response = await fetcher(action, {
        method: "POST", redirect: "manual", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html",
          Origin: ORIGIN, Referer: url.href, ...(cookie ? { Cookie: cookie } : {}) },
        body: body.toString(),
      });
      const location = response.headers.get("location");
      const redirect = location ? new URL(location, action) : null;
      const ids = redirect?.searchParams.getAll("leadid") || [];
      const confirmed = [302, 303].includes(response.status) && redirect?.origin === ORIGIN &&
        !redirect.username && !redirect.password && redirect.pathname === "/buyingcenter/marketreport.aspx" &&
        redirect.searchParams.getAll("did").length === 1 && redirect.searchParams.get("did") === DEALER &&
        ids.length === 1 && isVinCueLeadId(ids[0]);
      // Never follow redirects or parse an arbitrary error page as success.
      await response.body?.cancel();
      if (!confirmed) throw new VinCueSubmissionError("submission_unknown");
      // Preserve the vendor continuation URL. Loading this page completes
      // vehicle/offer processing; the contact receipt alone is incomplete.
      if (!redirect || !isVinCueOfferUrl(redirect.href, ids[0]) ||
        redirect.searchParams.get("year") !== lead.vehicle.year ||
        redirect.searchParams.get("mmid") !== String(match.mmid) ||
        redirect.searchParams.get("trimid") !== String(match.trimid)) {
        throw new VinCueSubmissionError("submission_unknown");
      }
      return { leadId: ids[0], offerUrl: redirect.href };
    } catch (error) {
      if (!postStarted && error instanceof VinCueSubmissionError && error.code === "vehicle_selection_required") throw error;
      // Even a POST returning 200/4xx is unconfirmed, not safe to retry.
      throw new VinCueSubmissionError(postStarted ? "submission_unknown" : "integration_unavailable");
    } finally { clearTimeout(timer); }
  };
}
export const submitVinCueLead = createVinCueSubmit();
