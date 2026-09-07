// Our application contract. This is not a VinCue API payload.
export type AppraisalLead = {
  vehicle: {
    vin: string;
    year: string;
    make: string;
    model: string;
    trim: string;
    bodyStyle: string;
    drivetrain: string;
    engine: string;
  };
  mileage: number;
  vinCueTrimId?: number;
  contact: { fullName: string; phone: string; email: string };
  appraisalContactConsent: true;
};

export class InvalidAppraisal extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidAppraisal("Please complete all appraisal details.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string") throw new InvalidAppraisal(`Please check ${label}.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || /[\x00-\x1f\x7f]/.test(clean)) {
    throw new InvalidAppraisal(`Please check ${label}.`);
  }
  return clean;
}

export function parseAppraisal(value: unknown): AppraisalLead {
  const body = object(value);
  const vehicle = object(body.vehicle);
  const contact = object(body.contact);
  const vin = text(vehicle.vin, "the VIN", 17).toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new InvalidAppraisal("Please enter a valid 17-character VIN.");
  }
  const year = text(vehicle.year, "the vehicle year", 4);
  if (!/^\d{4}$/.test(year) || Number(year) < 1981 || Number(year) > new Date().getUTCFullYear() + 2) {
    throw new InvalidAppraisal("Please check the vehicle year.");
  }
  if (typeof body.mileage !== "number" || !Number.isSafeInteger(body.mileage) || body.mileage < 1 || body.mileage > 9999999) {
    throw new InvalidAppraisal("Please enter valid whole-number mileage.");
  }
  if (body.condition !== undefined || body.payoff !== undefined || body.photos !== undefined) {
    throw new InvalidAppraisal("Please refresh this page to use the current submission form. Condition, payoff, and photos are collected during follow-up.");
  }
  if (body.vinCueTrimId !== undefined && (typeof body.vinCueTrimId !== "number" || !Number.isSafeInteger(body.vinCueTrimId) || body.vinCueTrimId <= 0)) {
    throw new InvalidAppraisal("Please choose a valid vehicle trim.");
  }
  const fullName = text(contact.fullName, "your name", 150);
  if (fullName.split(/\s+/).length < 2) throw new InvalidAppraisal("Please enter your first and last name.");
  const phone = text(contact.phone, "your phone number", 30);
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d().\s-]+$/.test(phone) || !/^(?:1)?\d{10}$/.test(digits)) {
    throw new InvalidAppraisal("Please enter a valid US phone number.");
  }
  const email = text(contact.email, "your email address", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvalidAppraisal("Please enter a valid email address.");
  }
  if (body.appraisalContactConsent !== true) {
    throw new InvalidAppraisal("Please agree to contact about your appraisal before submitting.");
  }

  // Construct an allowlisted payload; never forward caller-supplied dealer IDs,
  // endpoints, cookies, hidden form fields, or arbitrary properties.
  return {
    vehicle: {
      vin, year,
      make: text(vehicle.make, "the vehicle make", 100),
      model: text(vehicle.model, "the vehicle model", 100),
      trim: text(vehicle.trim, "the vehicle trim", 200, false),
      bodyStyle: text(vehicle.bodyStyle, "the body style", 200, false),
      drivetrain: text(vehicle.drivetrain, "the drivetrain", 200, false),
      engine: text(vehicle.engine, "the engine", 100, false),
    },
    mileage: body.mileage,
    ...(body.vinCueTrimId === undefined ? {} : { vinCueTrimId: body.vinCueTrimId as number }),
    contact: { fullName, phone: `+${digits.length === 10 ? "1" : ""}${digits}`, email },
    appraisalContactConsent: true,
  };
}

export function isVinCueLeadId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}
