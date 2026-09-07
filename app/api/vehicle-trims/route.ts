import { getVinCueTrimChoices } from "../../../lib/vincue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const vin = (query.get("vin") || "").trim().toUpperCase();
  const year = query.get("year") || "";
  const headers = { "Cache-Control": "no-store" };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !/^\d{4}$/.test(year) || Number(year) < 1981 || Number(year) > new Date().getUTCFullYear() + 2) {
    return Response.json({ error: "Please check the VIN and year." }, { status: 400, headers });
  }
  try {
    return Response.json({ choices: await getVinCueTrimChoices(vin, year) }, { headers });
  } catch {
    return Response.json({ error: "Vehicle trims are temporarily unavailable. Please try again." }, { status: 503, headers });
  }
}
