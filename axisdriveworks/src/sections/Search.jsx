import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSuggestions } from "../Api/FetchApi";
import "./Search.css";

const Search = () => {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const navigate = useNavigate();

  // 250ms debounced suggest with AbortController
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await fetchSuggestions(trimmed, ctrl.signal);
        setSuggestions(list);
        setIsOpen(list.length > 0);
        setActiveIndex(-1);
      } catch {
        // Abort or network error handled
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSelect = (item) => {
    if (!item) return;
    setIsOpen(false);
    setValue(`${item.brand} ${item.model}`);
    navigate(`/car/${item.brand_slug}/${item.model_slug}`);
  };

  const handleCustomSearch = (rawText) => {
    const text = String(rawText || value).trim();
    if (!text) return;
    setIsOpen(false);

    const parts = text.split(/\s+/);
    const brand = parts[0] || "car";
    const model = parts.slice(1).join("-") || "model";

    const cleanBrandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const cleanModelSlug = model.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    navigate(`/car/${cleanBrandSlug}/${cleanModelSlug}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelect(suggestions[activeIndex]);
      } else if (isOpen && suggestions.length > 0) {
        handleSelect(suggestions[0]);
      } else {
        handleCustomSearch(value);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="search-wrapper" ref={containerRef}>
      <div className="search-container">
        <input
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-suggestions-list"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder="Search any car in the world..."
          className="search-input"
          id="global-car-search"
        />
        <button
          className="search-btn"
          aria-label="Search"
          onClick={() => (suggestions.length > 0 ? handleSelect(suggestions[0]) : handleCustomSearch(value))}
        >
          {isLoading ? "⏳" : "🔍"}
        </button>
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul id="search-suggestions-list" role="listbox" className="suggestions-dropdown">
          {suggestions.map((item, idx) => (
            <li
              key={item.spec_key || `${item.brand}-${item.model}-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={`suggestion-item ${idx === activeIndex ? "active" : ""}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <div className="suggestion-info">
                <span className="suggestion-name">
                  <strong>{item.brand}</strong> {item.model}
                </span>
                {item.year_start && (
                  <span className="suggestion-years">
                    {item.year_start}{item.year_end ? `–${item.year_end}` : "+"}
                  </span>
                )}
              </div>
              {item.has_3d_model === 1 && (
                <span className="tag-3d" title="Interactive 3D Showroom Available">3D</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Search;
