"use client";
import {FormEvent,useEffect,useRef,useState} from "react";
import { isVinCueLeadId, parseAppraisal } from "../lib/appraisal";
import { isVinCueOfferUrl } from "../lib/vincue-offer";
type Vehicle={vin:string;year:string;make:string;model:string;trim:string;bodyStyle:string;drivetrain:string;engine:string};type Step="lookup"|"vehicle"|"mileage"|"contact"|"done";
const Brand=({footer=false}:{footer?:boolean})=><a className={`brand ${footer?"footerBrand":""}`} href="#top"><img className="brandLogo" src="/228-logo.jpg" alt="228 Sell Us Your Car"/></a>;
export default function Home(){const[lookupType,setLookupType]=useState<"vin"|"plate">("vin"),[value,setValue]=useState(""),[vehicle,setVehicle]=useState<Vehicle|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[step,setStep]=useState<Step>("lookup"),[mileage,setMileage]=useState(""),[name,setName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState("");
const [submitting, setSubmitting] = useState(false);
const [leadId, setLeadId] = useState("");
const [offerUrl, setOfferUrl] = useState("");
const [trimChoices, setTrimChoices] = useState<{ id: number; name: string }[]>([]);
const [vinCueTrimId, setVinCueTrimId] = useState<number | undefined>();
const [submissionUnknown, setSubmissionUnknown] = useState(false);
const submissionLock = useRef(false);
const attemptKey = "228-vincue-attempt-v1";
useEffect(() => {
  try {
    const saved = sessionStorage.getItem(attemptKey);
    if (saved?.startsWith("{")) {
      const receipt = JSON.parse(saved);
      if (isVinCueLeadId(receipt.leadId) && isVinCueOfferUrl(receipt.offerUrl, receipt.leadId)) {
        setLeadId(receipt.leadId); setOfferUrl(receipt.offerUrl); setStep("done"); return;
      }
    }
    if (saved) {
      setSubmissionUnknown(true);
      setError("You already started a submission in this tab. Please contact the 228 team before submitting again.");
    }
  } catch { /* Submission checks storage again before sending. */ }
}, []);
async function startOffer(e:FormEvent){e.preventDefault();setError("");if(lookupType==="plate"){setError("License plate lookup is coming next. For now, enter the 17-character VIN.");return}const vin=value.trim().toUpperCase();if(vin.length!==17){setError("Please enter the full 17-character VIN.");return}setLoading(true);try{const r=await fetch("/api/decode-vin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vin})}),d=await r.json();if(!r.ok)throw new Error(d.error||"We couldn't decode that VIN.");const tr=await fetch(`/api/vehicle-trims?${new URLSearchParams({vin,year:d.year})}`,{cache:"no-store"}),td=await tr.json();if(!tr.ok||!Array.isArray(td.choices)||td.choices.length===0)throw new Error("We couldn't load the vehicle trims. Please try the VIN lookup again.");setVehicle(d);setTrimChoices(td.choices);setVinCueTrimId(td.choices.length===1?td.choices[0].id:undefined);setStep("vehicle")}catch(err){setError(err instanceof Error?err.message:"We couldn't decode that VIN.")}finally{setLoading(false)}}
function submitMileage(e:FormEvent){e.preventDefault();const n=Number(mileage.replace(/,/g,""));if(!n||n<1){setError("Enter the vehicle's current mileage.");return}setMileage(n.toLocaleString());setError("");setStep("contact")}
async function submitContact(e: FormEvent) {
  e.preventDefault();
  if (submissionLock.current || submissionUnknown) return;
  setError("");
  let payload;
  try {
    payload = parseAppraisal({
      vehicle,
      mileage: Number(mileage.replace(/,/g, "")),
      contact: { fullName: name, phone, email },
      ...(vinCueTrimId === undefined ? {} : { vinCueTrimId }),
      appraisalContactConsent: true,
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Please check your appraisal details.");
    return;
  }
  try {
    if (sessionStorage.getItem(attemptKey)) {
      setSubmissionUnknown(true);
      setError("Please contact the 228 team before submitting again.");
      return;
    }
    sessionStorage.setItem(attemptKey, "pending");
  } catch {
    setError("Please enable browser storage so we can protect your submission from accidental retries.");
    return;
  }
  submissionLock.current = true;
  setSubmitting(true);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "error",
    });
    const result = await response.json();
    if (response.status === 201 && result?.ok === true && isVinCueLeadId(result.leadId) && isVinCueOfferUrl(result.offerUrl, result.leadId)) {
      try { sessionStorage.setItem(attemptKey, JSON.stringify({ leadId: result.leadId, offerUrl: result.offerUrl })); } catch { /* Keep the existing pending lock; the link still renders. */ }
      setOfferUrl(result.offerUrl);
      setLeadId(result.leadId);
      setStep("done");
      return;
    }
    if (response.status === 409 && result?.code === "vehicle_selection_required" && result.ok === false && result.retryable === true && Array.isArray(result.choices) && result.choices.length > 0 && result.choices.length <= 30 && result.choices.every((choice: {id?: unknown; name?: unknown}) => typeof choice.id === "number" && Number.isSafeInteger(choice.id) && choice.id > 0 && typeof choice.name === "string" && choice.name.length < 300)) {
      sessionStorage.removeItem(attemptKey);
      setTrimChoices(result.choices);
      setVinCueTrimId(undefined);
      setError("VinCue found several possible trims. Choose yours below, then submit again. Nothing has been sent yet.");
      return;
    }
    // Only a recognized negative acknowledgement permits another attempt.
    // Unknown/network outcomes can follow acceptance by the provider.
    const retryableStatus: Record<string, number> = {
      invalid_appraisal: 400, invalid_json: 400, invalid_origin: 403,
      payload_too_large: 413, unsupported_content_type: 415,
      integration_unavailable: 503, submission_rejected: 422,
    };
    if (!response.ok && result?.ok === false && result.retryable === true && retryableStatus[result.code] === response.status && typeof result.error === "string") {
      sessionStorage.removeItem(attemptKey);
      setError(result.error);
      return;
    }
    throw new Error("Unconfirmed submission");
  } catch {
    setSubmissionUnknown(true);
    setError("We couldn't confirm whether your appraisal was received. Please contact the 228 team before submitting again.");
  } finally {
    window.clearTimeout(timeout);
    submissionLock.current = false;
    setSubmitting(false);
  }
}
const progress:{[key:string]:number}={vehicle:25,mileage:50,contact:75,done:100};
return <main><header className="nav shell"><Brand/><nav><a href="#how">How It Works</a><a href="#why">Why 228?</a><a className="navCta" href="#offer">Get My Offer</a></nav></header><section className="hero" id="top"><div className="shell heroGrid"><div className="heroCopy"><p className="eyebrow">MISSISSIPPI GULF COAST CAR BUYING</p><h1>Sell your car.<br/><span>Skip the runaround.</span></h1><p className="heroText">Get a fast, straightforward offer for your vehicle. No purchase required. No pressure. Just a simple way to sell your car.</p><div className="trustRow"><span>✓ Free appraisal</span><span>✓ We handle payoffs</span><span>✓ Local team</span></div></div><div className="offerCard" id="offer">{step!=="lookup"&&<><div className="progress"><span style={{width:`${progress[step]}%`}}/></div><p className="stepLabel">{step==="done"?"SUBMITTED":"APPRAISAL IN PROGRESS"}</p></>}
{step==="lookup"&&<><p className="cardKicker">START YOUR OFFER</p><h2>What are you selling?</h2><div className="toggle"><button className={lookupType==="vin"?"active":""} onClick={()=>{setLookupType("vin");setError("")}}>VIN</button><button className={lookupType==="plate"?"active":""} onClick={()=>{setLookupType("plate");setError("")}}>License Plate</button></div><form onSubmit={startOffer}><label>Enter your {lookupType==="vin"?"VIN":"plate number"}</label><input value={value} onChange={e=>setValue(e.target.value.toUpperCase())} maxLength={lookupType==="vin"?17:12} placeholder={lookupType==="vin"?"17-character VIN":"ABC 1234"}/>{error&&<p className="formError">{error}</p>}<button className="primaryBtn" disabled={loading}>{loading?"LOOKING UP YOUR VEHICLE...":"GET MY OFFER →"}</button></form><p className="finePrint">Takes about 2 minutes. No obligation.</p></>}
{step==="vehicle"&&vehicle&&<div className="vehicleState"><div className="checkCircle">✓</div><p className="cardKicker">WE FOUND YOUR VEHICLE</p><h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2>{vehicle.trim&&<p className="vehicleTrim">{vehicle.trim}</p>}<div className="vehicleDetails">{vehicle.bodyStyle&&<span>{vehicle.bodyStyle}</span>}{vehicle.engine&&<span>{vehicle.engine}</span>}{vehicle.drivetrain&&<span>{vehicle.drivetrain}</span>}</div><p className="vinDisplay">VIN: {vehicle.vin}</p><h3>Is this your vehicle?</h3>{trimChoices.length>1&&<fieldset><legend>Choose your trim</legend><p className="questionHelp">This VIN matches more than one trim. Which one is yours?</p>{trimChoices.map(choice=><label key={choice.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",textAlign:"left"}}><input type="radio" name="vehicle-trim" checked={vinCueTrimId===choice.id} onChange={()=>setVinCueTrimId(choice.id)} style={{width:"auto",margin:0}}/>{choice.name}</label>)}</fieldset>}<button className="primaryBtn" disabled={vinCueTrimId===undefined} onClick={()=>setStep("mileage")}>YES, CONTINUE →</button><button className="vehicleBack" onClick={()=>{setVehicle(null);setStep("lookup")}}>No, re-enter VIN</button></div>}
{step==="mileage"&&<div className="questionState"><p className="cardKicker">CURRENT MILEAGE</p><h2>How many miles are on it?</h2><p className="questionHelp">An estimate is fine.</p><form onSubmit={submitMileage}><div className="mileageInput"><input inputMode="numeric" value={mileage} onChange={e=>setMileage(e.target.value.replace(/[^0-9]/g,""))} placeholder="e.g. 42,500"/><span>MILES</span></div>{error&&<p className="formError">{error}</p>}<button className="primaryBtn">CONTINUE →</button></form><button className="vehicleBack" onClick={()=>setStep("vehicle")}>← Back</button></div>}
{step === "contact" && <div className="questionState">
  <p className="cardKicker">LAST STEP</p>
  <h2>Where should we send your offer?</h2>
  <p className="questionHelp">A local 228 buying specialist will review your vehicle and follow up about condition, payoff, and photos.</p>
  <form onSubmit={submitContact} aria-busy={submitting}>
    {trimChoices.length > 1 && vinCueTrimId === undefined && <fieldset disabled={submitting || submissionUnknown}>
      <legend>Which trim is your vehicle?</legend>
      {trimChoices.map(choice => <label key={choice.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input type="radio" name="vincue-trim" required checked={vinCueTrimId === choice.id} onChange={() => setVinCueTrimId(choice.id)} style={{ width: "auto", margin: 0 }} />
        {choice.name}
      </label>)}
    </fieldset>}
    <label htmlFor="contact-name">Your name</label>
    <input id="contact-name" autoComplete="name" required maxLength={150} disabled={submitting || submissionUnknown} value={name} onChange={e => setName(e.target.value)} placeholder="First & last name" />
    <label htmlFor="contact-phone">Mobile phone</label>
    <input id="contact-phone" type="tel" autoComplete="tel" required maxLength={30} disabled={submitting || submissionUnknown} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(228) 555-1234" />
    <label htmlFor="contact-email">Email</label>
    <input id="contact-email" type="email" required autoComplete="email" maxLength={254} disabled={submitting || submissionUnknown} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
    {error && <p className="formError" role="alert">{error}</p>}
    <button className="primaryBtn" disabled={submitting || submissionUnknown}>{submitting ? "SUBMITTING YOUR VEHICLE..." : submissionUnknown ? "PLEASE CONTACT THE 228 TEAM" : "SUBMIT MY VEHICLE →"}</button>
  </form>
  <p className="consent">By submitting, you agree that 228 Sell Us Your Car may contact you about your appraisal by phone, text, or email.</p>
  <button className="vehicleBack" disabled={submitting || submissionUnknown} onClick={() => { setError(""); setStep("mileage"); }}>← Back</button>
</div>}
{step==="done"&&leadId&&offerUrl&&<div className="vehicleState"><div className="checkCircle">✓</div><p className="cardKicker">SUBMISSION RECEIVED</p><h2>Dealer review required.</h2><p className="questionHelp">Your vehicle details were sent to the 228 buying team. A local specialist will review the vehicle and follow up about condition, payoff, photos, and the next step on your offer.</p><a className="primaryBtn" href={offerUrl} referrerPolicy="no-referrer">VIEW MY RESULTS →</a><p className="importantNote" role="status">VinCue reference: <strong>{leadId}</strong></p><p className="finePrint">If VinCue shows an error or inspection notice, your submission is still recorded. You do not need to submit again.</p></div>}</div></div></section>
<section className="statsBand"><div className="shell statsGrid"><div><strong>2 MIN</strong><span>to start your appraisal</span></div><div><strong>$0</strong><span>cost to get an offer</span></div><div><strong>0</strong><span>purchase required</span></div></div></section><section className="section shell" id="how"><div className="sectionHeading"><p className="eyebrow dark">HOW IT WORKS</p><h2>Three steps. That’s it.</h2><p>Fast enough to do from your phone and simple enough to know exactly what happens next.</p></div><div className="stepsGrid"><article><span className="stepNum">01</span><h3>Tell us about your car</h3><p>Start with your VIN, mileage, and contact details.</p></article><article><span className="stepNum">02</span><h3>Get your offer</h3><p>Our local buying team reviews your vehicle and gives you a straightforward offer.</p></article><article><span className="stepNum">03</span><h3>Get paid</h3><p>We verify the details, handle the paperwork, and complete the purchase.</p></article></div></section><section className="whySection" id="why"><div className="shell whyGrid"><div><p className="eyebrow">WHY SELL TO 228?</p><h2>We buy cars.<br/>Not just trades.</h2><p className="whyLead">You do not have to buy another vehicle from us. If you just want to sell your car and walk away, that is completely fine.</p></div><div className="benefits"><div><span>01</span><h3>Financed? No problem.</h3><p>We can work with your lender and handle the payoff process.</p></div><div><span>02</span><h3>Local people, real answers.</h3><p>Your appraisal is handled by a local buying team.</p></div><div><span>03</span><h3>No pressure to trade.</h3><p>Sell your vehicle whether you're replacing it today, later, or not at all.</p></div></div></div></section><footer><div className="shell footerGrid"><Brand footer/><p>Serving Gulfport, Biloxi, D'Iberville, Ocean Springs, Long Beach and the Mississippi Gulf Coast.</p><p className="copyright">© 2026 228 Sell Us Your Car.</p></div></footer></main>}
