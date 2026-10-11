import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getReservations,
  markReservationComplete,
  cancelReservation,
  rescheduleReservation,
  clearCompletedReservations,
  hasSession,
  createSession,
  getSessionEmail,
  clearSession,
  getManageTokens
} from "../Api/FetchApi";
import "./BookingsPage.css";

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [email, setEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(hasSession() || getManageTokens().length > 0);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reschedulingId, setReschedulingId] = useState(null);
  const [newDate, setNewDate] = useState("");
  const navigate = useNavigate();

  const getErrorMessage = (errType) => {
    if (errType === "rate_limited") return "Too many requests, try again shortly.";
    if (errType === "auth") return "Session expired. Please sign in again.";
    if (errType === "network") return "Check your connection.";
    return "Server error, try later.";
  };

  // Load bookings when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      getReservations()
        .then(data => {
          setBookings(data || []);
        })
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      await createSession(email);
      setIsAuthenticated(true);
    } catch (err) {
      setAuthError(err.message || "Failed to authenticate. Please try again.");
    }
  };

  const handleLogout = () => {
    clearSession();
    setIsAuthenticated(false);
    setBookings([]);
    setEmail("");
    setActionError("");
  };

  const handleTestDrive = async (booking) => {
    setActionError("");
    const res = await markReservationComplete(booking.id);
    const { ok, error } = typeof res === "object" ? res : { ok: Boolean(res), error: res ? null : "server" };

    if (ok) {
      const updatedBookings = bookings.map(b =>
        b.id === booking.id ? { ...b, completed: 1 } : b
      );
      setBookings(updatedBookings);
      navigate("/models", { state: { filterBrand: booking.car_brand } });
    } else {
      if (error === "aborted") return;
      if (error === "auth") {
        setIsAuthenticated(false);
        clearSession();
      }
      setActionError(getErrorMessage(error));
    }
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this test drive?")) return;
    setActionError("");
    const res = await cancelReservation(id);
    if (res.ok) {
      setBookings(prev => prev.filter(b => b.id !== id));
    } else {
      setActionError(res.error || "Failed to cancel reservation.");
    }
  };

  const handleRescheduleBooking = async (e, id) => {
    e.preventDefault();
    if (!newDate) return;
    setActionError("");
    const res = await rescheduleReservation(id, newDate);
    if (res.ok) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, date: newDate, completed: 0 } : b));
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
      const remaining = bookings.filter(b => !b.completed);
      setBookings(remaining);
    } else {
      if (error === "aborted") return;
      if (error === "auth") {
        setIsAuthenticated(false);
        clearSession();
      }
      setActionError(getErrorMessage(error));
    }
  };

  // ── Email Gate (Not Authenticated) ──
  if (!isAuthenticated) {
    return (
      <div className="bookings-page">
        <div className="showcase-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px' }}>
          <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
          <h2 style={{ margin: 0 }}>My Reservations</h2>
          <div style={{ width: '80px' }}></div>
        </div>

        <div className="auth-gate">
          <div className="auth-card">
            <div className="auth-icon">🔐</div>
            <h3>Verify Your Identity</h3>
            <p>Enter the email you used when booking your test drive to view your reservations.</p>

            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-input-wrapper">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
                <div className="input-glow" />
              </div>
              {authError && <p className="auth-error">{authError}</p>}
              <button type="submit" className="auth-submit-btn">Access My Bookings</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated View ──
  return (
    <div className="bookings-page">
      <div className="showcase-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px' }}>
        <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
        <h2 style={{ margin: 0 }}>My Reservations</h2>
        <div className="top-actions">
          <span className="session-email">{getSessionEmail()}</span>
          {bookings.some(b => b.completed) && (
            <button className="clear-btn" onClick={clearCompleted}>Clear Completed</button>
          )}
          <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
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
            <h3>No Test Drives Booked</h3>
            <p>Go to the Showcase to reserve a vehicle.</p>
            <button className="primary-btn" onClick={() => navigate("/")}>Explore Cars</button>
          </div>
        ) : (
          <div className="bookings-grid">
            {bookings.map((booking, index) => (
              <div
                key={booking.id}
                className={`booking-card ${booking.completed ? 'completed' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="booking-card-inner">
                  <div className="booking-header">
                    <h3>{booking.car_brand} {booking.car_model}</h3>
                    <span className="booking-date">{booking.date}</span>
                  </div>
                  <div className="booking-details">
                    <p><strong>Name:</strong> {booking.name}</p>
                    <p><strong>Booking ID:</strong> #{String(booking.id).slice(-6).padStart(6, '0')}</p>
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
                        <form onSubmit={(e) => handleRescheduleBooking(e, booking.id)} className="reschedule-form">
                          <input
                            type="date"
                            required
                            min={new Date().toISOString().split("T")[0]}
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
                            onClick={() => handleCancelBooking(booking.id)}
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
