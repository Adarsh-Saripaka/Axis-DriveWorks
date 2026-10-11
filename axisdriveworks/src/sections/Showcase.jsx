import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchCarSpecs,
  reportCarSpecs,
  getCarPlaceholderSvg,
  bookTestDrive,
  hasSession,
  createSession,
  getSessionEmail
} from "../Api/FetchApi";
import { AVAILABLE_MODELS } from "../viewer/ModelRegistry";
import "./Showcase.css";

function unslug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Showcase() {
  const { brandSlug, modelSlug } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [carData, setCarData] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);

  // Booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMsg, setReportMsg] = useState("");
  const [reportStatus, setReportStatus] = useState("");

  // 1. Fetch live specs & image from dynamic backend engine
  useEffect(() => {
    let active = true;

    async function loadData() {
      // Determine target brand and model
      let targetBrand = "";
      let targetModel = "";

      if (brandSlug && modelSlug) {
        targetBrand = unslug(brandSlug);
        targetModel = unslug(modelSlug);
      } else if (state?.hero) {
        targetBrand = state.hero.brand;
        targetModel = state.hero.model;
      } else if (state?.brand) {
        targetBrand = state.brand;
        targetModel = state.model || "Overview";
      }

      if (!targetBrand) {
        navigate("/", { replace: true });
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchCarSpecs(targetBrand, targetModel);

        if (!active) return;

        if (result && result.specs) {
          setCarData(result);
          if (result.image?.url) {
            setActiveImage(result.image.url);
            setImageMeta(result.image);
          } else {
            setActiveImage(getCarPlaceholderSvg(targetModel, targetBrand));
            setImageMeta(null);
          }
        } else if (state?.hero) {
          // Fallback to router state hero if available
          setCarData({
            specs: state.hero,
            confidence: "medium",
            source_urls: [],
            cached: true,
            has_3d_model: state.hero.has_3d_model || 0,
            model_3d_id: state.hero.model_3d_id || null
          });
          setActiveImage(getCarPlaceholderSvg(state.hero.model, state.hero.brand));
        } else {
          setError("Could not retrieve specifications for this vehicle. Please check your query.");
        }
      } catch (err) {
        if (active) setError(err.message || "Failed to load vehicle data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [brandSlug, modelSlug, state, navigate]);

  const specs = carData?.specs || {};
  const brandName = specs.brand || unslug(brandSlug) || "Vehicle";
  const modelName = specs.model || unslug(modelSlug) || "Model";
  const specKey = carData?.specs ? `${brandName.toLowerCase()}-${modelName.toLowerCase()}`.replace(/\s+/g, "-") : "";

  // 3D Model link resolution
  const matched3D = carData?.model_3d_id
    ? AVAILABLE_MODELS.find((m) => m.id === carData.model_3d_id)
    : null;

  const handleOpen3D = () => {
    if (matched3D?.url) {
      navigate("/viewer", {
        state: {
          modelUrl: matched3D.url,
          carName: `${brandName} ${modelName}`,
          modelId: matched3D.id
        }
      });
    } else {
      navigate("/models", { state: { filterBrand: brandName } });
    }
  };

  const handleBookTestDrive = async (e) => {
    e.preventDefault();
    if (bookingSubmitting) return;

    setBookingError("");
    setBookingSubmitting(true);

    const data = new FormData(e.target);
    const email = String(data.get("email") || "").trim();
    const name = String(data.get("name") || "").trim();
    const date = String(data.get("date") || "").trim();

    try {
      if (!hasSession() || getSessionEmail() !== email.toLowerCase()) {
        await createSession(email).catch(() => {});
      }

      const newBooking = {
        car_brand: brandName,
        car_model: modelName,
        name,
        email,
        date,
        spec_key: specKey
      };

      const result = await bookTestDrive(newBooking);

      if (result && result.ok) {
        setBookingSuccess(true);
        setTimeout(() => {
          setShowBookingModal(false);
          setBookingSuccess(false);
          setBookingSubmitting(false);
          navigate("/bookings");
        }, 1800);
      } else {
        setBookingError(result?.error || "Failed to book test drive. Please verify your details.");
        setBookingSubmitting(false);
      }
    } catch (err) {
      setBookingError(err.message || "Booking failed.");
      setBookingSubmitting(false);
    }
  };

  const handleSendReport = async (e) => {
    e.preventDefault();
    if (!reportMsg.trim()) return;

    setReportStatus("submitting");
    const res = await reportCarSpecs(specKey, reportMsg);
    if (res.ok) {
      setReportStatus("success");
      setTimeout(() => {
        setShowReportModal(false);
        setReportStatus("");
        setReportMsg("");
      }, 2000);
    } else {
      setReportStatus("error");
    }
  };

  return (
    <div className="showcase loaded">
      {/* NAVIGATION BAR */}
      <div className="showcase-top">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← BACK
        </button>
        <h2>Axis DriveWorks</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: "12px", alignItems: "center" }}>
          {carData?.confidence && (
            <span className={`confidence-badge confidence-${carData.confidence}`}>
              ● {carData.confidence.toUpperCase()} CONFIDENCE
            </span>
          )}
        </div>
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="showcase-loading-box">
          <div className="spinner" />
          <h3>Researching vehicle with live Google Search & AI...</h3>
          <p>Compiling verified automotive technical specifications and finding best 4K photography.</p>
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div className="showcase-error-box">
          <h3>Vehicle Data Unavailable</h3>
          <p>{error}</p>
          <button className="primary-btn" onClick={() => navigate("/")}>
            Return to Explorer
          </button>
        </div>
      )}

      {/* MAIN SHOWCASE */}
      {!loading && carData && (
        <div className="showcase-main showcase-split">
          {/* LEFT: IMAGE & BADGES */}
          <div className="showcase-hero">
            <img
              src={activeImage || getCarPlaceholderSvg(modelName, brandName)}
              alt={`${brandName} ${modelName}`}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = getCarPlaceholderSvg(modelName, brandName);
              }}
            />
            <div className="hero-shadow" />
            <div className="hero-overlay">
              <h1>
                {brandName} {modelName}
              </h1>
              <div className="hero-badges">
                {specs.year_start && <span>{specs.year_start}{specs.year_end ? `–${specs.year_end}` : ""}</span>}
                {specs.body_style && <span>{specs.body_style}</span>}
                {specs.country_origin && <span>{specs.country_origin}</span>}
                {specs.variant_used && <span className="variant-badge">{specs.variant_used}</span>}
              </div>

              {/* 3D SHOWROOM BUTTON (Only shown when 3D asset is available) */}
              {(carData.has_3d_model === 1 || matched3D) && (
                <button className="view-3d-btn" onClick={handleOpen3D}>
                  Interactive 3D Showroom {matched3D ? `(${matched3D.name})` : ""}
                </button>
              )}
            </div>

            {/* ATTRIBUTION BAR */}
            {imageMeta && (
              <div className="image-attribution-bar">
                <span>
                  Photo via <strong>{imageMeta.source}</strong> · {imageMeta.author || "Editorial"} ({imageMeta.licence || "Public"})
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: SPEC SHEET */}
          <div className="showcase-info">
            {specs.msrp_usd && (
              <div className="price-tag">
                <span className="label">ORIGINAL MSRP {specs.msrp_year ? `(${specs.msrp_year})` : ""}</span>
                <h3 className="price">${Number(specs.msrp_usd).toLocaleString()}</h3>
              </div>
            )}

            <p className="subtitle">
              {[specs.fuel_type, specs.drivetrain, specs.transmission].filter(Boolean).join(" · ") || "Performance Specification"}
            </p>

            <div className="spec-table">
              {specs.horsepower_hp && <Spec label="Horsepower: " value={`${specs.horsepower_hp} HP`} />}
              {specs.torque_nm && <Spec label="Torque: " value={`${specs.torque_nm} Nm`} />}
              {specs.zero_to_100_kmh_s && <Spec label="0–100 km/h: " value={`${specs.zero_to_100_kmh_s}s`} />}
              {specs.top_speed_kmh && <Spec label="Top Speed: " value={`${specs.top_speed_kmh} km/h`} />}
              {specs.displacement_cc && <Spec label="Engine Displacement: " value={`${specs.displacement_cc} cc`} />}
              {specs.cylinders && <Spec label="Cylinders: " value={`${specs.cylinders}`} />}
              {specs.curb_weight_kg && <Spec label="Curb Weight: " value={`${specs.curb_weight_kg} kg`} />}
              {specs.seats && <Spec label="Seating: " value={`${specs.seats} Seats`} />}
              {specs.doors && <Spec label="Doors: " value={`${specs.doors} Doors`} />}
              {!specs.horsepower_hp && !specs.torque_nm && (
                <div className="spec-baseline-notice">
                  <p>{specs.notes || "Baseline vehicle catalog entry. Deep specifications are actively compiling."}</p>
                </div>
              )}
            </div>

            {/* CITATIONS & SOURCES */}
            {carData.source_urls && carData.source_urls.length > 0 && (
              <div className="sources-box">
                <span className="sources-label">Verified Sources:</span>
                <div className="sources-links">
                  {carData.source_urls.slice(0, 5).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="source-tag">
                      {new URL(url).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="actions-row">
              <button className="primary-btn" onClick={() => setShowBookingModal(true)}>
                Reserve for Test Drive
              </button>
              <button className="report-btn" onClick={() => setShowReportModal(true)}>
                Report Incorrect Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING MODAL */}
      {showBookingModal &&
        createPortal(
          <div className="modal-overlay" onClick={() => setShowBookingModal(false)}>
            <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
              <button className="close-modal" onClick={() => setShowBookingModal(false)}>
                ✕
              </button>

              {bookingSuccess ? (
                <div className="booking-success">
                  <div className="success-icon">✓</div>
                  <h3>Reservation Confirmed</h3>
                  <p>Your test drive for the {brandName} {modelName} is scheduled. Redirecting...</p>
                </div>
              ) : (
                <form className="booking-form" onSubmit={handleBookTestDrive}>
                  <h3>Book Test Drive</h3>
                  <p className="modal-subtitle">{brandName} {modelName}</p>

                  <div className="form-group">
                    <label>Full Name</label>
                    <input name="name" type="text" required placeholder="John Doe" />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="john@example.com"
                      defaultValue={getSessionEmail() || ""}
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Date</label>
                    <input name="date" type="date" required min={new Date().toISOString().split("T")[0]} />
                  </div>

                  {bookingError && <p className="booking-error">{bookingError}</p>}

                  <button type="submit" className="primary-btn submit-btn" disabled={bookingSubmitting}>
                    {bookingSubmitting ? "Confirming Reservation..." : "Confirm Reservation"}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* REPORT DATA MODAL */}
      {showReportModal &&
        createPortal(
          <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
            <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
              <button className="close-modal" onClick={() => setShowReportModal(false)}>
                ✕
              </button>

              <h3>Report Incorrect Specifications</h3>
              <p className="modal-subtitle">{brandName} {modelName}</p>

              {reportStatus === "success" ? (
                <p style={{ color: "#00ffff", padding: "20px 0" }}>Thank you! Your correction report has been logged.</p>
              ) : (
                <form onSubmit={handleSendReport} className="booking-form">
                  <div className="form-group">
                    <label>What specification is inaccurate?</label>
                    <textarea
                      required
                      rows={4}
                      value={reportMsg}
                      onChange={(e) => setReportMsg(e.target.value)}
                      placeholder="e.g. Horsepower should be 720 HP instead of 710 HP for the Pista variant..."
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(0,255,255,0.3)",
                        color: "#fff",
                        borderRadius: "8px",
                        padding: "10px"
                      }}
                    />
                  </div>

                  {reportStatus === "error" && <p className="booking-error">Could not submit report. Please try again.</p>}

                  <button type="submit" className="primary-btn submit-btn" disabled={reportStatus === "submitting"}>
                    {reportStatus === "submitting" ? "Submitting..." : "Submit Report"}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div className="spec-card">
      <span className="spec-label">{label}</span>
      <span className="spec-value">{value}</span>
    </div>
  );
}
