import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import "./App.css";

import Hero from "./sections/Hero";
import Footer from "./sections/Footer";
import Search from "./sections/Search";
import Showcase from "./sections/Showcase";
import BrandCard from "./sections/BrandCard";
import BrandPage from "./sections/BrandPage";
import ModelsLibrary from "./viewer/ModelsLibrary";
import ViewerPage from "./viewer/ViewerPage";
import BookingsPage from "./sections/BookingsPage";

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const Home = ({ onSearch }) => {
  const navigate = useNavigate();

  const popularBrands = [
    { name: "BMW", logo: "https://www.carlogos.org/car-logos/bmw-logo-2020.png" },
    { name: "Audi", logo: "https://www.carlogos.org/car-logos/audi-logo.png" },
    { name: "Porsche", logo: "https://www.carlogos.org/car-logos/porsche-logo.png" },
    { name: "Ferrari", logo: "https://www.carlogos.org/car-logos/ferrari-logo.png" },
    { name: "Lamborghini", logo: "https://www.carlogos.org/car-logos/lamborghini-logo.png" },
    { name: "Mercedes", logo: "https://www.carlogos.org/car-logos/mercedes-benz-logo.png" }
  ];

  return (
    <div className="app-container">
      {/* TASKBAR */}
      <header className="taskbar">
        <div className="logo_title">
          <img src="/Logo.png" alt="Axis DriveWorks Logo" className="logo" />
          <h1 className="title">Axis DriveWorks</h1>
        </div>

        <Search onSearch={onSearch} />

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

  const handleSearch = (results, query) => {
    if (!Array.isArray(results) || results.length === 0) {
      alert("No cars found matching your search.");
      return;
    }

    // Direct to showcase with the first result
    navigate("/showcase", {
      state: { hero: results[0], brand: results[0].brand }
    });
  };

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home onSearch={handleSearch} />} />
      <Route path="/showcase" element={<Showcase />} />
      <Route path="/brand/:brand" element={<BrandPage />} />
      <Route path="/models" element={<ModelsLibrary />} />
      <Route path="/viewer" element={<ViewerPage />} />
      <Route path="/bookings" element={<BookingsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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