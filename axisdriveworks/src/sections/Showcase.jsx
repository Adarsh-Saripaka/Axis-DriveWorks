import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { searchCars, getCarImage } from "../Api/FetchApi";
import VehicleCard from "./VehicleCard";
import "./Showcase.css";

export default function Showcase() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const title = state?.brand || state?.hero?.brand || "Cars";
  const [cars, setCars] = useState([]);
  const [hero, setHero] = useState(state?.hero || null);
  const [images, setImages] = useState({});
  const [heroImage, setHeroImage] = useState("https://placehold.co/600x400/1C1C1C/00ffff?text=Axis+DriveWorks+Showroom");
  const [loading, setLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Redirect if no data
  useEffect(() => {
    if (!title && !state?.hero) {
      navigate("/", { replace: true });
    }
  }, [title, state?.hero, navigate]);

  useEffect(() => {
    if (title) {
      setLoading(true);
      searchCars(title)
        .then((data) => {
          const uniqueCars = [];
          const seenModels = new Set();
          for (const car of data) {
            if (!seenModels.has(car.model)) {
              seenModels.add(car.model);
              uniqueCars.push(car);
            }
          }
          
          setCars(uniqueCars);
          // If no hero was passed in navigation state, use the first result
          if (!state?.hero && uniqueCars.length > 0) {
            setHero(uniqueCars[0]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [title, state?.hero]);

  // Sync state if it changes (e.g. nested navigation)
  useEffect(() => {
    if (state?.hero) {
      setHero(state.hero);
    }
  }, [state?.hero]);

  useEffect(() => {
    if (hero) {
      getCarImage(`${hero.brand} ${hero.model}`).then(setHeroImage);
    }
  }, [hero]);

  // Load all card images in parallel
  useEffect(() => {
    async function loadImages() {
      const entries = await Promise.all(
        cars.map(async (car) => {
          const key = `${car.brand}-${car.model}`;
          const url = await getCarImage(`${car.brand} ${car.model}`);
          return [key, url];
        })
      );
      setImages(Object.fromEntries(entries));
    }
    if (cars.length) loadImages();
  }, [cars]);

  const handleViewDetails = (car) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    navigate("/showcase", {
      state: { hero: car, brand: title }
    });
  };

  const handleBookTestDrive = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const newBooking = {
      id: Date.now(),
      car: hero,
      name: data.get("name"),
      email: data.get("email"),
      date: data.get("date"),
    };
    
    const existing = JSON.parse(localStorage.getItem("autovision_bookings") || "[]");
    localStorage.setItem("autovision_bookings", JSON.stringify([...existing, newBooking]));
    
    setBookingSuccess(true);
    setTimeout(() => {
      setShowBookingModal(false);
      setBookingSuccess(false);
      navigate("/bookings");
    }, 2000);
  };

  const handleView3D = () => {
    if (!hero) return;
    navigate("/models", { state: { filterBrand: hero.brand } });
  };

  if (!title && !hero) return null;

  return (
    <div className="showcase loaded">
      <div className="showcase-top">
        <button className="back-btn" onClick={() => navigate(-1)}>← BACK</button>
        <h2>Axis DriveWorks</h2>
      </div>

      {hero && (
        <div className="showcase-main showcase-split">
          <div className="showcase-hero">
            <img src={heroImage} alt={hero.model} />
            <div className="hero-shadow" />
            <div className="hero-overlay">
              <h1>{hero.brand} {hero.model}</h1>
              <div className="hero-badges">
                <span>{hero.year}</span>
                <span>{hero.body_style}</span>
                <span>{hero.country_origin}</span>
              </div>

              <button className="view-3d-btn" onClick={handleView3D}>
                Interactive 3D Showroom
              </button>
            </div>
          </div>

          <div className="showcase-info">
            <div className="price-tag">
              <span className="label">MSRP</span>
              <h3 className="price">${Number(hero.msrp_usd).toLocaleString()}</h3>
            </div>
            
            <p className="subtitle">
              {hero.engine_type || 'Standard'} Engine · {hero.transmission || 'Auto'} · {hero.drivetrain || 'AWD'}
            </p>

            <div className="spec-table">
              <Spec label="Horsepower" value={hero.horsepower ? `${hero.horsepower} HP` : 'N/A'} />
              <Spec label="Torque" value={hero.torque_nm ? `${hero.torque_nm} Nm` : 'N/A'} />
              <Spec label="0–100 km/h" value={hero.zero_to_hundred_kmh ? `${hero.zero_to_hundred_kmh}s` : 'N/A'} />
              <Spec label="Top Speed" value={hero.top_speed_kmh ? `${hero.top_speed_kmh} km/h` : 'N/A'} />
              <Spec label="Cylinders" value={hero.cylinders || 'N/A'} />
              <Spec label="Weight" value={hero.weight_kg ? `${hero.weight_kg} kg` : 'N/A'} />
            </div>

            <button className="primary-btn" onClick={() => setShowBookingModal(true)}>
              Reserve for Test Drive
            </button>
          </div>
        </div>
      )}

      {/* Premium Booking Modal */}
      {showBookingModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowBookingModal(false)}>
          <div className="booking-modal" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowBookingModal(false)}>✕</button>
            
            {bookingSuccess ? (
              <div className="booking-success">
                <div className="success-icon">✓</div>
                <h3>Reservation Confirmed</h3>
                <p>Your test drive for the {hero.brand} {hero.model} has been scheduled. Check your email for details.</p>
              </div>
            ) : (
              <form className="booking-form" onSubmit={handleBookTestDrive}>
                <h3>Book Test Drive</h3>
                <p className="modal-subtitle">{hero.brand} {hero.model}</p>
                
                <div className="form-group">
                  <label>Full Name</label>
                  <input name="name" type="text" required placeholder="John Doe" />
                </div>
                
                <div className="form-group">
                  <label>Email Address</label>
                  <input name="email" type="email" required placeholder="john@example.com" />
                </div>
                
                <div className="form-group">
                  <label>Preferred Date</label>
                  <input name="date" type="date" required />
                </div>
                
                <button type="submit" className="confirm-btn">Confirm Reservation</button>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {cars.length > 0 && (
        <section className="more-models">
          <h2 className="section-title">Explore {title} Fleet</h2>
          <div className="car-grid">
            {cars.map((car, i) => (
              <VehicleCard
                key={i}
                name={car.model}
                brand={car.brand}
                price={car.msrp_usd}
                feature={`${car.horsepower} HP`}
                image={images[`${car.brand}-${car.model}`]}
                onView={() => handleViewDetails(car)}
              />
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="showcase-loading">
          <div className="loader"></div>
          <p>Analyzing Fleet Data...</p>
        </div>
      )}
    </div>
  );
}

const Spec = ({ label, value }) => (
  <div className="spec-row">
    <span>{label}</span>
    <b>{value}</b>
  </div>
);
