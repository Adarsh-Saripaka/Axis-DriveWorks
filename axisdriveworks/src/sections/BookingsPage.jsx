import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getReservations,
  markReservationComplete,
  cancelReservation,
  rescheduleReservation,
  clearCompletedReservations,
  getManageTokens,
  saveManageToken,
  clearAllManageTokens,
  requestMagicLink
} from "../Api/FetchApi";
import { useAuth } from "../context/AuthContext";
import "./BookingsPage.css";

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicMessage, setMagicMessage] = useState("");
  const [magicDebugUrl, setMagicDebugUrl] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reschedulingId, setReschedulingId] = useState(null);
  const [newDate, setNewDate] = useState("");
  const navigate = useNavigate();

  const { user, loginWithGoogle, loginWithMagicToken, logout, loading: authLoading } = useAuth();

  const getErrorMessage = (errType) => {
    if (errType === "rate_limited") return "Too many requests, try again shortly.";
    if (errType === "auth") return "Session expired or unauthorized.";
    if (errType === "network") return "Check your internet connection.";
    return "Server error, please try again later.";
  };

  const loadBookings = () => {
    setLoading(true);
    setActionError("");
    getReservations()
      .then((data) => {
        setBookings(data || []);
      })
      .catch((err) => {
        setActionError(err.message || "Failed to load reservations.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get("magic_token");
    if (magicToken) {
      setLoading(true);
      loginWithMagicToken(magicToken)
        .then(() => {
          // Clean the query parameter from the URL bar without reloading
          window.history.replaceState({}, document.title, window.location.pathname);
          loadBookings();
        })
        .catch((err) => {
          setActionError(err.message || "Failed to verify magic link.");
        })
        .finally(() => setLoading(false));
      return;
    }

    if (!authLoading) {
      loadBookings();
    }
  }, [user, authLoading]);

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setMagicMessage("");
    setMagicDebugUrl("");
    setActionError("");

    const trimmed = magicEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setActionError("Please enter a valid email address.");
      return;
    }

    setMagicLoading(true);
    try {
      const res = await requestMagicLink(trimmed);
      if (res.ok) {
        setMagicMessage(res.message || "Magic link sent! Check your email or use the link below.");
        if (res.debugUrl) {
          setMagicDebugUrl(res.debugUrl);
        }
      } else {
        setActionError(res.error || "Failed to generate magic link.");
      }
    } catch (err) {
      setActionError(err.message || "Error requesting magic link.");
    } finally {
      setMagicLoading(false);
    }
  };

  const handleImportToken = async (e) => {
    e.preventDefault();
    setTokenError("");
    const trimmed = tokenInput.trim();
    if (!trimmed || trimmed.length < 16) {
      setTokenError("Please enter a valid booking management token.");
      return;
    }

    saveManageToken(trimmed);
    setTokenInput("");
    loadBookings();
  };

  const handleClearDevice = () => {
    if (window.confirm("Remove all saved booking tokens from this device?")) {
      clearAllManageTokens();
      setBookings([]);
      setActionError("");
    }
  };

  const handleTestDrive = async (booking) => {
    setActionError("");
    const res = await markReservationComplete(booking.id, booking.manage_token);
    const { ok, error } = typeof res === "object" ? res : { ok: Boolean(res), error: res ? null : "server" };

    if (ok) {
      const updatedBookings = bookings.map((b) =>
        b.id === booking.id ? { ...b, completed: 1 } : b
      );
      setBookings(updatedBookings);
      navigate("/models", { state: { filterBrand: booking.car_brand } });
    } else {
      if (error === "aborted") return;
      setActionError(getErrorMessage(error));
    }
  };

  const handleCancelBooking = async (booking) => {
    if (!window.confirm("Are you sure you want to cancel this test drive?")) return;
    setActionError("");
    const res = await cancelReservation(booking.id, booking.manage_token);
    if (res.ok) {
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    } else {
      setActionError(res.error || "Failed to cancel reservation.");
    }
  };

  const handleRescheduleBooking = async (e, booking) => {
    e.preventDefault();
    if (!newDate) return;
    setActionError("");
    const res = await rescheduleReservation(booking.id, newDate, booking.manage_token);
    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, date: newDate, completed: 0 } : b))
      );
      setReschedulingId(null);
      setNewDate("");
    } else {
      setActionError(res.error || "Failed to reschedule reservation.");
    }
  };

  const clearCompleted = async () => {
    setActionError("");
    const res = await clearCompletedReservations();
    const { ok, error } = typeof res === "object" ? res : { ok: Boolean(res), error: res ? null : "server" };

    if (ok) {
      const remaining = bookings.filter((b) => !b.completed);
      setBookings(remaining);
    } else {
      if (error === "aborted") return;
      setActionError(getErrorMessage(error));
    }
  };

  const todayMinDate = new Date().toLocaleDateString("en-CA");
  const hasTokens = getManageTokens().length > 0;

  // ── Unauthenticated & No Local Tokens View ──
  if (!user && !hasTokens && bookings.length === 0 && !loading) {
    return (
      <div className="bookings-page">
        <div className="showcase-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px" }}>
          <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
          <h2 style={{ margin: 0 }}>My Reservations</h2>
          <div style={{ width: "80px" }}></div>
        </div>

        <div className="auth-gate">
          <div className="auth-card">
            <div className="auth-icon">🔐</div>
            <h3>Sign In to View Reservations</h3>
            <p>Sign in with your Google account to access all your confirmed test drive bookings.</p>

            <button
              className="auth-submit-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "15px auto" }}
              onClick={async () => {
                setActionError("");
                try {
                  await loginWithGoogle();
                } catch (err) {
                  setActionError(err.message || "Google Sign-In failed.");
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

            {actionError && <p className="auth-error">{actionError}</p>}

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "15px", marginTop: "15px" }}>
              <p style={{ fontSize: "0.88rem", color: "#ddd", marginBottom: "6px", fontWeight: "600" }}>
                ✨ Access via Email Magic Link
              </p>
              <p style={{ fontSize: "0.78rem", color: "#888", marginBottom: "12px" }}>
                Zero passwords or tokens stored on device. Enter your reservation email for an instant login link.
              </p>
              <form onSubmit={handleSendMagicLink} className="auth-form">
                <div className="auth-input-wrapper">
                  <input
                    type="email"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="Enter your booking email"
                    required
                  />
                  <div className="input-glow" />
                </div>
                <button
                  type="submit"
                  className="auth-submit-btn"
                  style={{ width: "100%", marginTop: "10px", background: "linear-gradient(90deg, #00ffff, #0088ff)", color: "#000", fontWeight: "700" }}
                  disabled={magicLoading}
                >
                  {magicLoading ? "Sending Link..." : "Send Magic Link ✉️"}
                </button>
              </form>

              {magicMessage && (
                <div style={{ marginTop: "12px", padding: "10px", background: "rgba(0, 255, 255, 0.08)", border: "1px solid rgba(0, 255, 255, 0.25)", borderRadius: "6px", fontSize: "0.8rem", color: "#00ffff" }}>
                  <p style={{ margin: "0 0 6px 0" }}>{magicMessage}</p>
                  {magicDebugUrl && (
                    <button
                      className="clear-btn"
                      style={{ fontSize: "0.75rem", padding: "6px 10px", width: "100%", borderColor: "#00ffff", color: "#00ffff", background: "rgba(0, 255, 255, 0.15)", cursor: "pointer" }}
                      onClick={() => {
                        window.location.href = magicDebugUrl;
                      }}
                    >
                      🚀 Click to Open Magic Link Demo
                    </button>
                  )}
                </div>
              )}
            </div>

            <details style={{ marginTop: "15px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", textAlign: "left" }}>
              <summary style={{ fontSize: "0.75rem", color: "#666", cursor: "pointer" }}>
                Advanced: Have a legacy management token?
              </summary>
              <form onSubmit={handleImportToken} className="auth-form" style={{ marginTop: "10px" }}>
                <div className="auth-input-wrapper">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste booking manage token"
                  />
                  <div className="input-glow" />
                </div>
                {tokenError && <p className="auth-error">{tokenError}</p>}
                <button type="submit" className="clear-btn" style={{ width: "100%", marginTop: "8px" }}>
                  View by Token
                </button>
              </form>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Bookings View ──
  return (
    <div className="bookings-page">
      <div className="showcase-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px" }}>
        <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
        <h2 style={{ margin: 0 }}>My Reservations</h2>
        <div className="top-actions">
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid #00ffff" }}
                />
              )}
              <span className="session-email">{user.email}</span>
            </div>
          ) : (
            <button
              className="clear-btn"
              onClick={async () => {
                try {
                  await loginWithGoogle();
                } catch (err) {
                  setActionError(err.message || "Login failed");
                }
              }}
            >
              Sign In
            </button>
          )}

          {bookings.some((b) => b.completed) && (
            <button className="clear-btn" onClick={clearCompleted}>Clear Completed</button>
          )}

          {user ? (
            <button className="logout-btn" onClick={logout}>Sign Out</button>
          ) : (
            <button className="logout-btn" onClick={handleClearDevice}>Clear Device</button>
          )}
        </div>
      </div>

      <div className="bookings-container">
        {actionError && <p className="auth-error" style={{ textAlign: "center", margin: "10px 0" }}>{actionError}</p>}
        {loading ? (
          <div className="bookings-loading">
            <div className="loader" />
            <p>Loading your reservations...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="no-bookings">
            <h3>No Active Test Drives</h3>
            <p>You have no scheduled test drives. Explore the showcase to reserve a vehicle.</p>
            <button className="primary-btn" onClick={() => navigate("/")}>Explore Cars</button>
          </div>
        ) : (
          <div className="bookings-grid">
            {bookings.map((booking, index) => (
              <div
                key={booking.id}
                className={`booking-card ${booking.completed ? "completed" : ""}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="booking-card-inner">
                  <div className="booking-header">
                    <h3>{booking.car_brand} {booking.car_model}</h3>
                    <span className="booking-date">{booking.date}</span>
                  </div>
                  <div className="booking-details">
                    <p><strong>Driver:</strong> {booking.name}</p>
                    <p><strong>Email:</strong> {booking.email}</p>
                    <p><strong>Booking ID:</strong> #{String(booking.id).slice(-6).padStart(6, "0")}</p>
                  </div>
                  {booking.completed ? (
                    <div className="completed-status">
                      <span className="tick-mark">✓</span> Test Drive Completed
                    </div>
                  ) : (
                    <div className="booking-actions-group">
                      <button
                        className="test-drive-btn"
                        onClick={() => handleTestDrive(booking)}
                      >
                        START 3D TEST DRIVE
                      </button>

                      {reschedulingId === booking.id ? (
                        <form onSubmit={(e) => handleRescheduleBooking(e, booking)} className="reschedule-form">
                          <input
                            type="date"
                            required
                            min={todayMinDate}
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              border: "1px solid rgba(0,255,255,0.4)",
                              background: "rgba(0,0,0,0.6)",
                              color: "#fff",
                              marginTop: "8px"
                            }}
                          />
                          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <button type="submit" className="test-drive-btn" style={{ padding: "6px 12px", fontSize: "0.85rem" }}>
                              Save Date
                            </button>
                            <button
                              type="button"
                              className="logout-btn"
                              style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                              onClick={() => setReschedulingId(null)}
                            >
                              Dismiss
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                          <button
                            type="button"
                            className="clear-btn"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
                            onClick={() => {
                              setReschedulingId(booking.id);
                              setNewDate(booking.date);
                            }}
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            className="logout-btn"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", borderColor: "rgba(255,80,80,0.5)", color: "#ff6666" }}
                            onClick={() => handleCancelBooking(booking)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="card-reflection" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
