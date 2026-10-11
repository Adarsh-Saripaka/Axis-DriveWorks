import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchBrandCars, getCarImage } from "../Api/FetchApi";
import VehicleCard from "./VehicleCard";
import "./BrandPage.css";

export default function BrandPage() {
  const { brand } = useParams();
  const navigate = useNavigate();

  const [cars, setCars] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCars, setTotalCars] = useState(0);
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);

  // Reset page when brand changes
  useEffect(() => {
    setPage(1);
  }, [brand]);

  // Fetch paginated cars for this brand
  useEffect(() => {
    if (!brand) return;
    const ctrl = new AbortController();
    setLoading(true);

    fetchBrandCars(brand, page, ctrl.signal)
      .then((res) => {
        setCars(res.cars || []);
        setTotalPages(res.totalPages || 1);
        setTotalCars(res.total || 0);
      })
      .catch(() => {
        setCars([]);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [brand, page]);

  // Load cached images for vehicles
  useEffect(() => {
    let active = true;
    async function loadImages() {
      const entries = await Promise.all(
        cars.map(async (car) => {
          const key = car.spec_key || `${car.brand}-${car.model}`;
          const url = await getCarImage(`${car.brand} ${car.model}`);
          return [key, url];
        })
      );
      if (active) {
        setImages(Object.fromEntries(entries));
      }
    }
    if (cars.length) {
      loadImages();
    }
    return () => {
      active = false;
    };
  }, [cars]);

  return (
    <div className="brand-page">
      {/* HEADER */}
      <div className="brand-header">
        <button className="back-btn" onClick={() => navigate("/")} aria-label="Back to home">
          ← Back to Explorer
        </button>
        <h1 className="brand-title">{brand}</h1>
        <p className="brand-subtitle">
          {totalCars} official {brand} models recorded in the Axis DriveWorks registry
        </p>
      </div>

      {loading && (
        <div className="brand-loading">
          <div className="spinner" />
          <p>Loading {brand} models...</p>
        </div>
      )}

      {/* GRID */}
      {!loading && (
        <div className="brand-grid-wrapper">
          {cars.length === 0 ? (
            <p className="no-cars-msg">No models found for {brand}.</p>
          ) : (
            <div className="car-grid">
              {cars.map((car) => {
                const key = car.spec_key || `${car.brand}-${car.model}`;
                return (
                  <VehicleCard
                    key={key}
                    name={car.model}
                    brand={car.brand}
                    price={car.year_start ? `${car.year_start}${car.year_end ? `–${car.year_end}` : "+"}` : "Specs"}
                    feature={car.has_3d_model ? "3D Showroom Available" : (car.body_style || "Production")}
                    image={images[key]}
                    onView={() => navigate(`/car/${car.brand_slug}/${car.model_slug}`)}
                  />
                );
              })}
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="page-indicator">
                Page {page} of {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
