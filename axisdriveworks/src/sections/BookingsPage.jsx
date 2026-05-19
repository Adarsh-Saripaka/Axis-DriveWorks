import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./BookingsPage.css";

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("autovision_bookings") || "[]");
    setBookings(saved);
  }, []);

  const handleTestDrive = (booking) => {
    // Mark as completed
    const updatedBookings = bookings.map(b => 
      b.id === booking.id ? { ...b, completed: true } : b
    );
    setBookings(updatedBookings);
    localStorage.setItem("autovision_bookings", JSON.stringify(updatedBookings));

    navigate("/models", { state: { filterBrand: booking.car.brand } });
  };

  const clearCompleted = () => {
    const remaining = bookings.filter(b => !b.completed);
    setBookings(remaining);
    localStorage.setItem("autovision_bookings", JSON.stringify(remaining));
  };

  return (
    <div className="bookings-page">
      <div className="showcase-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px' }}>
        <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
        <h2 style={{ margin: 0 }}>My Reservations</h2>
        {bookings.some(b => b.completed) ? (
          <button className="clear-btn" onClick={clearCompleted}>Clear Completed Logs</button>
        ) : (
          <div style={{ width: '80px' }}></div>
        )}
      </div>

      <div className="bookings-container">
        {bookings.length === 0 ? (
          <div className="no-bookings">
            <h3>No Test Drives Booked</h3>
            <p>Go to the Showcase to reserve a vehicle.</p>
            <button className="primary-btn" onClick={() => navigate("/")}>Explore Cars</button>
          </div>
        ) : (
          <div className="bookings-grid">
            {bookings.map((booking) => (
              <div key={booking.id} className={`booking-card ${booking.completed ? 'completed' : ''}`}>
                <div className="booking-header">
                  <h3>{booking.car.brand} {booking.car.model}</h3>
                  <span className="booking-date">{booking.date}</span>
                </div>
                <div className="booking-details">
                  <p><strong>Name:</strong> {booking.name}</p>
                  <p><strong>Email:</strong> {booking.email}</p>
                  <p><strong>Booking ID:</strong> #{booking.id.toString().slice(-6)}</p>
                </div>
                {booking.completed ? (
                  <div className="completed-status">
                    <span className="tick-mark">✓</span> Test Drive Done
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
