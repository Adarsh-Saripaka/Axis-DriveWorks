import React, { useRef } from "react";
import { getCarPlaceholderSvg } from "../Api/FetchApi";
import "./VehicleCard.css";

const VehicleCard = ({ name, brand, price, feature, image, onView, onMouseEnter }) => {
  const cardRef = useRef();

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    
    cardRef.current.style.setProperty('--rx', `${rotateX}deg`);
    cardRef.current.style.setProperty('--ry', `${rotateY}deg`);
    cardRef.current.style.setProperty('--glare-opacity', '0.25');
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty('--rx', '0deg');
    cardRef.current.style.setProperty('--ry', '0deg');
    cardRef.current.style.setProperty('--glare-opacity', '0');
  };

  const placeholder = getCarPlaceholderSvg(name || "Car", brand || "Axis");

  // Format price safely to avoid NaN output
  const isNumericPrice = typeof price === "number" || (price && !isNaN(Number(price)) && !String(price).includes("–"));
  const priceDisplay = isNumericPrice
    ? `Price: $${Number(price).toLocaleString()}`
    : (price ? `Years: ${price}` : "Specs on File");

  return (
    <div 
      className="CarCard-wrapper"
      style={{ perspective: '1000px' }}
      onMouseEnter={onMouseEnter}
    >
      <div 
        className="CarCard"
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="card-glare" />
        
        <div className="car-section">
          <h2 className="CarName">{name}</h2>

          <div className="car-img-wrapper">
            <img
              src={image || placeholder}
              alt={name}
              className="car-img"
              loading="lazy"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = placeholder;
              }}
            />
          </div>

          <p className="brand">Brand: {brand}</p>
          <p className="price">{priceDisplay}</p>
          <p className="feature">{feature}</p>

          <button className="details" onClick={onView} aria-label={`View specifications for ${brand} ${name}`}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleCard;
