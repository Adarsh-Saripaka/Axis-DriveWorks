import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AVAILABLE_MODELS } from "./ModelRegistry";
import { getCarImage } from "../Api/FetchApi";
import { useGLTF } from "@react-three/drei";
import "./ModelsLibrary.css";

function ModelCard({ model, onClick }) {
  const [imgSrc, setImgSrc] = useState(model.img);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setImgSrc(model.img);
    setRetrying(false);
  }, [model]);

  const handleError = () => {
    if (!retrying) {
      setRetrying(true);
      getCarImage(model.brand + " " + model.name)
        .then((url) => {
          setImgSrc(url);
        })
        .catch(() => {
          setImgSrc("https://placehold.co/600x400/1C1C1C/00ffff?text=Image+Not+Found");
        });
    } else {
      setImgSrc("https://placehold.co/600x400/1C1C1C/00ffff?text=Image+Not+Found");
    }
  };

  const handleMouseEnter = () => {
    if (model.url) {
      useGLTF.preload(model.url, true);
    }
  };

  return (
    <div className="model-card" onClick={onClick} onMouseEnter={handleMouseEnter}>
      <div className="model-img-wrapper">
        <img src={imgSrc} alt={model.name} loading="lazy" onError={handleError} />
        <div className="hover-overlay">
          <span>Click to View 3D</span>
        </div>
      </div>
      <h3>{model.name}</h3>
    </div>
  );
}

export default function ModelsLibrary() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const filterBrand = state?.filterBrand?.toLowerCase();

  // Group models by brand
  const groupedModels = AVAILABLE_MODELS.reduce((acc, model) => {
    if (!acc[model.brand]) acc[model.brand] = [];
    acc[model.brand].push(model);
    return acc;
  }, {});

  const scrollRef = useRef({});

  // Auto-scroll to specific brand section if coming from Showcase redirect
  useEffect(() => {
    if (filterBrand && scrollRef.current[filterBrand]) {
      scrollRef.current[filterBrand].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [filterBrand]);

  const handleOpenViewer = (model) => {
    navigate("/viewer", { state: { modelUrl: model.url } });
  };

  return (
    <div className="models-library">
      <div className="library-header">
        <button className="back-btn" onClick={() => navigate("/")}>← Home</button>
        <h1>3D Models Library</h1>
        <p>Explore high-fidelity 3D assets available in Axis DriveWorks</p>
      </div>

      <div className="library-content">
        {Object.entries(groupedModels).map(([brand, models]) => (
          <section
            key={brand}
            className="brand-section"
            ref={(el) => (scrollRef.current[brand.toLowerCase()] = el)}
          >
            <h2 className="brand-heading">{brand} Models</h2>
            <div className="models-grid">
              {models.map((model) => (
                <ModelCard 
                  key={model.id} 
                  model={model} 
                  onClick={() => handleOpenViewer(model)} 
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
