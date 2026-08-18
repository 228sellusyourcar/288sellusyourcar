import { NextResponse } from "next/server";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cleanVin = String(body?.vin || "").trim().toUpperCase();

    if (!VIN_PATTERN.test(cleanVin)) {
      return NextResponse.json(
        { error: "Please enter a valid 17-character VIN." },
        { status: 400 }
      );
    }

    const url =
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/` +
      `${encodeURIComponent(cleanVin)}?format=json`;

    const response = await fetch(url, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error(`NHTSA request failed with ${response.status}`);
    }

    const data = await response.json();
    const vehicle = data?.Results?.[0];

    if (!vehicle?.Make || !vehicle?.Model || !vehicle?.ModelYear) {
      return NextResponse.json(
        { error: "We couldn't identify that VIN. Double-check it and try again." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      vin: cleanVin,
      year: vehicle.ModelYear || "",
      make: vehicle.Make || "",
      model: vehicle.Model || "",
      trim: vehicle.Trim || vehicle.Series || "",
      bodyStyle: vehicle.BodyClass || "",
      drivetrain: vehicle.DriveType || "",
      engine: vehicle.DisplacementL ? `${vehicle.DisplacementL}L` : "",
    });
  } catch (error) {
    console.error("VIN decode failed", error);
    return NextResponse.json(
      { error: "Unable to decode the VIN right now. Please try again." },
      { status: 500 }
    );
  }
}
