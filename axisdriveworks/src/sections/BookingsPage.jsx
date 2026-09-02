import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getReservations,
  markReservationComplete,
  clearCompletedReservations,
  hasSession,
  createSession,
  getSessionEmail,
  clearSession
} from "../Api/FetchApi";
import "./BookingsPage.css";

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [email, setEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(hasSession());
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Load bookings when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      getReservations()
        .then(data => {
          setBookings(data);
          // If returned empty and we had a session, it might be expired
          if (data.length === 0 && hasSession()) {
            // Session might still be valid, just no bookings
          }
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
  };

  const handleTestDrive = async (booking) => {
    await markReservationComplete(booking.id);
    const updatedBookings = bookings.map(b =>
      b.id === booking.id ? { ...b, completed: 1 } : b
    );
    setBookings(updatedBookings);
    navigate("/models", { state: { filterBrand: booking.car_brand } });
  };

  const clearCompleted = async () => {
    await clearCompletedReservations();
    const remaining = bookings.filter(b => !b.completed);
    setBookings(remaining);
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
                    <button
                      className="test-drive-btn"
                      onClick={() => handleTestDrive(booking)}
                    >
                      START 3D TEST DRIVE
                    </button>
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
