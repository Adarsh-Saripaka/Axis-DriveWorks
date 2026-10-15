import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import "./App.css";

import Hero from "./sections/Hero";
import Footer from "./sections/Footer";
import Search from "./sections/Search";
import Showcase from "./sections/Showcase";
import BrandPage from "./sections/BrandPage";
import BookingsPage from "./sections/BookingsPage";
import { useAuth } from "./context/AuthContext";

const ModelsLibrary = lazy(() => import("./viewer/ModelsLibrary"));
const ViewerPage = lazy(() => import("./viewer/ViewerPage"));

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const Home = () => {
  const navigate = useNavigate();
  const { user, loginWithGoogle, logout } = useAuth();

  const popularBrands = [
    { name: "BMW", logo: "https://upload.wikimedia.org/wikipedia/commons/4/44/BMW.svg" },
    { name: "Audi", logo: "https://upload.wikimedia.org/wikipedia/commons/9/92/Audi-Logo_2016.svg" },
    { name: "Porsche", logo: "https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/porsche.svg" },
    { name: "Ferrari", logo: "https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/ferrari.svg" },
    { name: "Lamborghini", logo: "https://upload.wikimedia.org/wikipedia/en/d/df/Lamborghini_Logo.svg" },
    { name: "Mercedes", logo: "https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes-Logo.svg" }
  ];

  return (
    <div className="app-container">
      {/* TASKBAR */}
      <header className="taskbar">
        <div className="logo_title">
          <img src="/Logo.png" alt="Axis DriveWorks Logo" className="logo" />
          <h1 className="title">Axis DriveWorks</h1>
        </div>

        <Search />

        <div className="nav_right">
          <div className="navlinks">
            <a
              href="/models"
              onClick={(e) => {
                e.preventDefault();
                navigate('/models');
              }}
            >
              3D Models Explorer
            </a>
            <a
              href="/bookings"
              onClick={(e) => {
                e.preventDefault();
                navigate('/bookings');
              }}
            >
              My Bookings
            </a>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("contact")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Contact
            </a>

            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
                {user.picture && (
                  <img
                    src={user.picture}
                    alt={user.name}
                    style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1px solid #00ffff" }}
                  />
                )}
                <button
                  onClick={logout}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,100,100,0.4)",
                    color: "#ff8888",
                    borderRadius: "15px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer"
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                style={{
                  background: "rgba(0,255,255,0.1)",
                  border: "1px solid #00ffff",
                  color: "#00ffff",
                  borderRadius: "20px",
                  padding: "5px 12px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  marginLeft: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO */}
      <div className="homepage">
        <Hero />
      </div>

      {/* BRANDS */}
      <p className="section-title">Explore Popular Brands</p>

      <section id="brands" className="brands-section">
        <div className="brand-grid">
          {popularBrands.map((brand) => (
            <div 
              key={brand.name} 
              className="brand-card" 
              onClick={() => navigate(`/brand/${brand.name}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="logo-wrapper">
                <img src={brand.logo} alt={brand.name} className="brand-logo" />
              </div>
              <p>{brand.name}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  const hideMobileNav = pathname === '/viewer';

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#00ffff" }}>Loading 3D Showroom...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route path="/car/:brandSlug/:modelSlug" element={<Showcase />} />
          <Route path="/brand/:brand" element={<BrandPage />} />
          <Route path="/models" element={<ModelsLibrary />} />
          <Route path="/viewer" element={<ViewerPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {!hideMobileNav && (
        <nav className="mobile-nav-bar">
          <button className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
            <span className="nav-icon">🏠</span>
            <span className="nav-label">Home</span>
          </button>
          <button className={`mobile-nav-item ${pathname === '/models' ? 'active' : ''}`} onClick={() => navigate('/models')}>
            <span className="nav-icon">🚗</span>
            <span className="nav-label">3D Models</span>
          </button>
          <button className={`mobile-nav-item ${pathname === '/bookings' ? 'active' : ''}`} onClick={() => navigate('/bookings')}>
            <span className="nav-icon">📅</span>
            <span className="nav-label">Bookings</span>
          </button>
        </nav>
      )}
    </>
  );
}

function NotFound() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a0a",
      color: "#fff",
      fontFamily: "sans-serif",
      textAlign: "center"
    }}>
      <h1 style={{ fontSize: "72px", margin: 0, color: "#00ffff" }}>404</h1>
      <p style={{ fontSize: "22px", color: "#aaa", marginTop: "12px" }}>Page not found</p>
      <a
        href="/"
        style={{
          marginTop: "28px",
          padding: "14px 36px",
          border: "2px solid #00ffff",
          borderRadius: "30px",
          color: "#fff",
          textDecoration: "none",
          fontSize: "16px",
          transition: "background 0.3s ease"
        }}
        onMouseEnter={(e) => e.target.style.background = "rgba(0,255,255,0.15)"}
        onMouseLeave={(e) => e.target.style.background = "transparent"}
      >
        ← Back to Home
      </a>
    </div>
  );
}