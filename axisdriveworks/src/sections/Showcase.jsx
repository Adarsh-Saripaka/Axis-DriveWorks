import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchCarSpecs,
  reportCarSpecs,
  getCarPlaceholderSvg,
  bookTestDrive
} from "../Api/FetchApi";
import { useAuth } from "../context/AuthContext";
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
  const { user, loginWithGoogle } = useAuth();

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
    const name = String(data.get("name") || user?.name || "").trim();
    const date = String(data.get("date") || "").trim();

    try {
      const newBooking = {
        car_brand: brandName,
        car_model: modelName,
        name,
        email: user?.email,
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
                {(specs.isEstimate || carData.confidence === "baseline") && (
                  <span className="badge-estimate" title={specs.source || "Estimated values based on catalog baseline"}>
                    ⚠ Estimated values
                  </span>
                )}
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
              ) : !user ? (
                <div className="booking-login-gate" style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🔐</div>
                  <h3>Sign In Required</h3>
                  <p className="modal-subtitle">
                    To prevent spam and secure your reservation, please sign in with your Google account.
                  </p>
                  {bookingError && <p className="booking-error" style={{ marginBottom: "15px" }}>{bookingError}</p>}
                  <button
                    type="button"
                    className="primary-btn submit-btn"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "20px auto 0" }}
                    onClick={async () => {
                      setBookingError("");
                      try {
                        await loginWithGoogle();
                      } catch (err) {
                        setBookingError(err.message || "Google Sign-In failed.");
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                      <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
                      <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
                    </svg>
                    Sign in with Google
                  </button>
                </div>
              ) : (
                <form className="booking-form" onSubmit={handleBookTestDrive}>
                  <h3>Book Test Drive</h3>
                  <p className="modal-subtitle">{brandName} {modelName}</p>

                  <div className="form-group">
                    <label>Full Name</label>
                    <input name="name" type="text" required defaultValue={user.name || ""} placeholder="John Doe" />
                  </div>

                  <div className="form-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label>Email Address</label>
                      <span style={{ fontSize: "0.75rem", color: "#00ffff" }}>✓ Verified with Google</span>
                    </div>
                    <input
                      name="email"
                      type="email"
                      value={user.email}
                      disabled
                      style={{ opacity: 0.8, cursor: "not-allowed" }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Date</label>
                    <input name="date" type="date" required min={new Date().toLocaleDateString("en-CA")} />
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
