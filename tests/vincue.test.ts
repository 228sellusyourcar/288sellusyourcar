import assert from "node:assert/strict";
import { test } from "node:test";
import { createVinCueSubmit } from "../lib/vincue";
import { parseAppraisal } from "../lib/appraisal";
const lead = parseAppraisal({ vehicle: { vin: "1HGCM82633A004352", year: "2003", make: "Honda", model: "Accord", trim: "EX", bodyStyle: "", drivetrain: "", engine: "" }, mileage: 120000, contact: { fullName: "Example Test Seller", phone: "2025550100", email: "test@example.com" }, appraisalContactConsent: true });
// Invented state and control names only; no HAR/customer/state fixtures.
function form(state: string) {
  return `<form id="theform" method="post" action="./contact.aspx?did=24831">
  <input type="hidden" name="__VIEWSTATE" value="${state}">
  <input type="hidden" name="__VIEWSTATEGENERATOR" value="synthetic-generator">
  <input type="hidden" name="test$__VS" value="synthetic&amp;state">
  <input type="hidden" name="test$tehDealerid$_inputhidden" value="24831">
  <input type="hidden" name="test$threfer$_inputhidden" value="https://288sellusyourcar1.vercel.app/">
  <input type="hidden" name="test$TableEditHidden1$_inputhidden" value="0">
  <input type="hidden" name="test$theforceleadtype$_inputhidden" value="-1">
  <input type="hidden" name="test$thvin$_inputhidden" value="1HGCM82633A004352">
  ${["first-name", "last-name", "phone", "email", "odometer"].map(x => `<input required class="lead-${x}" name="test$${x}">`).join("")}
  <select class="yearselector" name="test$year"><option value="2003">2003</option></select>
  <input type="checkbox" name="marketing">
  <a id="submitBtn" href="javascript:__doPostBack('test$teLeadFormSubmitLead','save:')">Submit</a></form>`;
}
function mock(options: { html?: string; location?: string; status?: number; lost?: boolean; matches?: unknown } = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = (async (input: URL | string | Request, init: RequestInit = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.pathname.endsWith("vehicleAutoComplete.aspx")) return Response.json(options.matches ?? [{ year: 2003, mmid: 1, trimid: 2, vehicleName: "2003 Honda Accord EX" }]);
    if (init.method !== "POST") return new Response(options.html ?? form("synthetic-fresh"), { headers: { "set-cookie": "test-affinity=fresh; Path=/buyingcenter; Secure; HttpOnly" } });
    if (options.lost) throw new Error("Private upstream details");
    return new Response(null, { status: options.status ?? 302, headers: { location: options.location ?? `/buyingcenter/marketreport.aspx?did=24831&leadid=12345&year=2003&mmid=1&trimid=${calls[1].url.searchParams.get("trimid")}` } });
  }) as typeof fetch;
  return { calls, submit: createVinCueSubmit(fetcher) };
}
test("minimal sequence uses fresh state, correct encoding, fresh cookies and verified receipt", async () => {
  const { calls, submit } = mock();
  assert.equal((await submit(lead)).leadId, "12345");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.searchParams.get("q"), lead.vehicle.vin);
  assert.equal(calls[1].url.searchParams.get("mmid"), "1");
  assert.equal(calls[1].url.searchParams.get("r"), "https://288sellusyourcar1.vercel.app/");
  assert.equal(calls[1].url.searchParams.get("followdealer"), "0");
  assert.equal(calls[1].url.searchParams.get("forceLeadType"), "-1");
  const post = calls[2];
  assert.equal(post.init.method, "POST"); assert.equal(post.init.redirect, "manual");
  assert.equal((post.init.headers as Record<string, string>).Cookie, "test-affinity=fresh");
  const body = new URLSearchParams(String(post.init.body));
  assert.equal(body.get("__VIEWSTATE"), "synthetic-fresh");
  assert.equal(body.get("test$__VS"), "synthetic&state");
  assert.equal(body.get("test$last-name"), "Test Seller");
  assert.equal(body.get("test$phone"), "+12025550100");
  assert.equal(body.get("test$year"), "2003");
  assert.equal(body.get("__EVENTARGUMENT"), "save:");
  assert.equal(body.has("marketing"), false);
  assert.equal(body.get("test$threfer$_inputhidden"), "https://288sellusyourcar1.vercel.app/");
  assert.equal(body.get("test$TableEditHidden1$_inputhidden"), "0");
  assert.equal(body.get("test$theforceleadtype$_inputhidden"), "-1");
});
test("form drift and ambiguous vehicle matches stop before POST", async () => {
  for (const options of [
    { matches: [] }, { matches: [{}, {}] }, { matches: [{ year: 2020, mmid: 1, trimid: 2, vehicleName: "Wrong" }] },
    { html: form("fresh").replace('value="24831"', 'value="999"') },
    { html: form("fresh").replace('value="https://288sellusyourcar1.vercel.app/"', 'value=""') },
    { html: form("fresh").replace('value="-1"', 'value=""') },
    { html: form("") }, { html: form("fresh").replace('./contact.aspx?did=24831', 'https://other.example/') },
    { html: form("fresh").replace('</form>', '<input required name="new-field"></form>') },
    { html: form("fresh").replace('value="2003"', 'value="2004"') },
    { html: form("fresh").replace('save:', 'unknown:') },
  ]) {
    const { submit, calls } = mock(options);
    await assert.rejects(submit(lead), { code: "integration_unavailable" });
    assert.equal(calls.some(c => c.init.method === "POST"), false);
  }
});
test("POST uncertainty never retries or follows redirects", async () => {
  for (const options of [
    { lost: true }, { status: 200 }, { status: 403 },
    { location: "https://other.example/buyingcenter/marketreport.aspx?did=24831&leadid=12345" },
    { location: "/buyingcenter/marketreport.aspx?did=999&leadid=12345" },
    { location: "/buyingcenter/marketreport.aspx?did=24831&leadid=12345&leadid=678" },
    { location: "/buyingcenter/marketreport.aspx?did=24831&leadid=0" },
  ]) {
    const { submit, calls } = mock(options);
    await assert.rejects(submit(lead), { code: "submission_unknown" });
    assert.equal(calls.filter(c => c.init.method === "POST").length, 1);
    assert.equal(calls.length, 3);
  }
});

test("ambiguous VIN requests a trim choice, then validates it against a fresh lookup", async () => {
  const matches = [
    { year: 2003, mmid: 1, trimid: 2, vehicleName: "2003 Honda Accord EX" },
    { year: 2003, mmid: 1, trimid: 3, vehicleName: "2003 Honda Accord LX" },
  ];
  for (const vinCueTrimId of [undefined, 999]) {
    const { submit, calls } = mock({ matches });
    await assert.rejects(submit({ ...lead, vinCueTrimId }), (error: any) => {
      assert.equal(error.code, "vehicle_selection_required");
      assert.deepEqual(error.choices, [{ id: 2, name: matches[0].vehicleName }, { id: 3, name: matches[1].vehicleName }]);
      return true;
    });
    assert.equal(calls.length, 1);
  }
  const { submit, calls } = mock({ matches });
  const receipt = await submit({ ...lead, vinCueTrimId: 3 });
  assert.equal(receipt.leadId, "12345");
  assert.equal(new URL(receipt.offerUrl).searchParams.get("trimid"), "3");
  assert.equal(calls[1].url.searchParams.get("trimid"), "3");
});

test("vehicle confirmation lookup returns trim choices using GET only", async () => {
  const { getVinCueTrimChoices } = await import("../lib/vincue");
  let calls = 0;
  const choices = await getVinCueTrimChoices(lead.vehicle.vin, lead.vehicle.year, (async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/buyingcenter/aj/vehicleAutoComplete.aspx");
    assert.equal(init?.method, undefined);
    assert.equal(init?.redirect, "manual");
    return Response.json([{ mmid: 1, trimid: 2, year: 2003, vehicleName: "2003 Honda Accord EX" }]);
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.deepEqual(choices, [{ id: 2, name: "2003 Honda Accord EX" }]);
});

test("offer continuation rejects missing, mismatched or unsafe redirect details", async () => {
  const { isVinCueOfferUrl } = await import("../lib/vincue-offer");
  const base = "https://pro.vincue.com/buyingcenter/marketreport.aspx?did=24831&leadid=12345&year=2003&mmid=1&trimid=2";
  assert.equal(isVinCueOfferUrl(base, "12345"), true);
  for (const url of [undefined, base.replace("https:", "http:"), base.replace("pro.vincue.com", "evil.example"), base+"&did=24831", base+"&next=https://evil.example", base+"#fragment", base.replace("leadid=12345", "leadid=99")]) assert.equal(isVinCueOfferUrl(url, "12345"), false);
  for (const location of ["/buyingcenter/marketreport.aspx?did=24831&leadid=12345", base.replace("trimid=2", "trimid=99"), base.replace("year=2003", "year=2020")]) {
    const { submit, calls } = mock({ location });
    await assert.rejects(submit(lead), { code: "submission_unknown" });
    assert.equal(calls.filter(c=>c.init.method === "POST").length, 1);
  }
});
