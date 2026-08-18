"use client";

import { FormEvent, useState } from "react";

type Vehicle = {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyStyle: string;
  drivetrain: string;
  engine: string;
};

const Brand = ({ footer = false }: { footer?: boolean }) => (
  <a className={`brand ${footer ? "footerBrand" : ""}`} href="#top" aria-label="228 Sell Us Your Car home">
    <img className="brandLogo" src="/228-logo.jpg" alt="228 Sell Us Your Car" />
  </a>
);

export default function Home() {
  const [lookupType, setLookupType] = useState<"vin" | "plate">("vin");
  const [value, setValue] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startOffer(e: FormEvent) {
    e.preventDefault();
    setError("");
    setVehicle(null);

    if (lookupType === "plate") {
      setError("License plate lookup is coming next. For now, enter the 17-character VIN.");
      return;
    }

    const vin = value.trim().toUpperCase();
    if (vin.length !== 17) {
      setError("Please enter the full 17-character VIN.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/decode-vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn't decode that VIN.");
      setVehicle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't decode that VIN.");
    } finally {
      setLoading(false);
    }
  }

  function resetVehicle() {
    setVehicle(null);
    setError("");
  }

  return (
    <main>
      <header className="nav shell">
        <Brand />
        <nav><a href="#how">How It Works</a><a href="#why">Why 228?</a><a className="navCta" href="#offer">Get My Offer</a></nav>
      </header>

      <section className="hero" id="top">
        <div className="shell heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">MISSISSIPPI GULF COAST CAR BUYING</p>
            <h1>Sell your car.<br /><span>Skip the runaround.</span></h1>
            <p className="heroText">Get a fast, straightforward offer for your vehicle. No purchase required. No pressure. Just a simple way to sell your car.</p>
            <div className="trustRow"><span>✓ Free appraisal</span><span>✓ We handle payoffs</span><span>✓ Local team</span></div>
          </div>

          <div className="offerCard" id="offer">
            {!vehicle ? (
              <>
                <p className="cardKicker">START YOUR OFFER</p>
                <h2>What are you selling?</h2>
                <div className="toggle">
                  <button type="button" className={lookupType === "vin" ? "active" : ""} onClick={() => { setLookupType("vin"); setError(""); }}>VIN</button>
                  <button type="button" className={lookupType === "plate" ? "active" : ""} onClick={() => { setLookupType("plate"); setError(""); }}>License Plate</button>
                </div>
                <form onSubmit={startOffer}>
                  <label htmlFor="vehicle-id">{lookupType === "vin" ? "Enter your VIN" : "Enter your plate number"}</label>
                  <input id="vehicle-id" value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} maxLength={lookupType === "vin" ? 17 : 12} placeholder={lookupType === "vin" ? "17-character VIN" : "ABC 1234"} autoComplete="off" />
                  {error && <p className="formError">{error}</p>}
                  <button className="primaryBtn" type="submit" disabled={loading}>{loading ? "LOOKING UP YOUR VEHICLE..." : "GET MY OFFER →"}</button>
                </form>
                <p className="finePrint">Takes about 2 minutes. No obligation.</p>
              </>
            ) : (
              <div className="vehicleState">
                <div className="checkCircle">✓</div>
                <p className="cardKicker">WE FOUND YOUR VEHICLE</p>
                <h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2>
                {vehicle.trim && <p className="vehicleTrim">{vehicle.trim}</p>}
                <div className="vehicleDetails">
                  {vehicle.bodyStyle && <span>{vehicle.bodyStyle}</span>}
                  {vehicle.engine && <span>{vehicle.engine}</span>}
                  {vehicle.drivetrain && <span>{vehicle.drivetrain}</span>}
                </div>
                <p className="vinDisplay">VIN: {vehicle.vin}</p>
                <h3>Is this your vehicle?</h3>
                <button className="primaryBtn" type="button" onClick={() => alert("Mileage step is next!")}>YES, CONTINUE →</button>
                <button className="vehicleBack" type="button" onClick={resetVehicle}>No, let me re-enter the VIN</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="statsBand"><div className="shell statsGrid"><div><strong>2 MIN</strong><span>to start your appraisal</span></div><div><strong>$0</strong><span>cost to get an offer</span></div><div><strong>0</strong><span>purchase required</span></div></div></section>
      <section className="section shell" id="how"><div className="sectionHeading"><p className="eyebrow dark">HOW IT WORKS</p><h2>Three steps. That’s it.</h2><p>We designed the process to be fast enough to do from your phone and simple enough to know exactly what happens next.</p></div><div className="stepsGrid"><article><span className="stepNum">01</span><h3>Tell us about your car</h3><p>Enter your VIN or plate, mileage, condition, and a few quick details.</p></article><article><span className="stepNum">02</span><h3>Get your offer</h3><p>Our local buying team reviews your vehicle and gives you a straightforward offer.</p></article><article><span className="stepNum">03</span><h3>Get paid</h3><p>Bring us the vehicle, we verify the details, handle the paperwork, and complete the purchase.</p></article></div></section>
      <section className="whySection" id="why"><div className="shell whyGrid"><div><p className="eyebrow">WHY SELL TO 228?</p><h2>We buy cars.<br />Not just trades.</h2><p className="whyLead">You do not have to buy another vehicle from us. If you just want to sell your car and walk away, that is completely fine.</p><a className="textLink" href="#offer">Start my offer →</a></div><div className="benefits"><div><span>01</span><h3>Financed? No problem.</h3><p>We can work with your lender and handle the payoff process.</p></div><div><span>02</span><h3>Local people, real answers.</h3><p>Your appraisal is handled by a local buying team — not a faceless national call center.</p></div><div><span>03</span><h3>No pressure to trade.</h3><p>Sell us your vehicle whether you are replacing it today, later, or not at all.</p></div></div></div></section>
      <section className="ctaSection"><div className="shell ctaBox"><div><p className="eyebrow">READY WHEN YOU ARE</p><h2>See what your car is worth.</h2></div><a className="lightBtn" href="#offer">GET MY OFFER →</a></div></section>
      <footer><div className="shell footerGrid"><Brand footer /><p>Serving Gulfport, Biloxi, D'Iberville, Ocean Springs, Long Beach and the Mississippi Gulf Coast.</p><p className="copyright">© 2026 228 Sell Us Your Car. All rights reserved.</p></div></footer>
    </main>
  );
}
