import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Vehicle3DViewer from "./Vehicle3DViewer";
import "./ViewerPage.css";

const BODY_COLORS = ["#ffffff", "#111111", "#ff0000", "#0000ff", "#00ff00", "#ffaa00", "#555555"];
const WHEEL_COLORS = ["#ffffff", "#111111", "#444444", "#aa8800"];

export default function ViewerPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  
  const [accentColor, setAccentColor] = useState("#ffffff");
  const [wheelColor, setWheelColor] = useState("#444444");
  const [bodyFinish, setBodyFinish] = useState("metallic");
  const [driveMode, setDriveMode] = useState(false);
  const [stance, setStance] = useState("stock");
  const [isExploded, setIsExploded] = useState(false);
  const [envType, setEnvType] = useState("city");
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    if (!state?.modelUrl) navigate("/");
  }, [state, navigate]);

  const handleSnapshot = () => {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = `autovision_snapshot_${Date.now()}.png`;
      link.click();
    }
  };

  if (!state?.modelUrl) return null;

  return (
    <div className="viewer-container">
      {/* Precision Navigation */}
      {!driveMode && (
        <button
          aria-label="Back to home"
          className="exit-btn"
          onClick={() => navigate(-1)}
        >
          [ EXIT_SHOWROOM ]
        </button>
      )}

      {/* Engineering Sidebar / Bottom Sheet on Mobile */}
      {!driveMode ? (
      <aside className="config-sidebar">
        <div className="sidebar-header">
          <h2 style={{ fontSize: "1.8rem", margin: "0", fontWeight: 900, letterSpacing: '-1px', textTransform: 'uppercase' }}>
            Config<span style={{ color: "#00ffff" }}>v1</span>
          </h2>
          <p style={{ fontSize: '0.65rem', color: "#666", marginTop: '5px', letterSpacing: '1px' }}>
            SYSTEM_CORE: ACTIVE // ASSET_ID: {state.id || '00'}
          </p>
        </div>
        
        {/* Exterior Section */}
        <div className="config-section">
          <label className="section-label">Surface_Finish</label>
          <div className="toggle-group" style={{ marginBottom: '15px' }}>
            {["metallic", "gloss", "matte"].map(finish => (
              <button
                key={finish}
                onClick={() => setBodyFinish(finish)}
                className={`toggle-btn ${bodyFinish === finish ? 'active' : ''}`}
              >
                {finish}
              </button>
            ))}
          </div>
          <div className="color-grid">
            {BODY_COLORS.map(color => (
              <button
                key={color}
                aria-label={`Color ${color}`}
                onClick={() => setAccentColor(color)}
                style={{
                  width: "100%", aspectRatio: '1/1', background: color,
                  border: accentColor === color ? `2px solid #00ffff` : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", transition: '0.2s',
                  boxShadow: accentColor === color ? `0 0 15px #00ffff` : 'none'
                }}
              />
            ))}
          </div>
        </div>

        {/* Wheels Section */}
        <div className="config-section">
          <label className="section-label">Alloy_Type</label>
          <div className="color-grid">
            {WHEEL_COLORS.map(color => (
              <button
                key={color}
                aria-label={`Wheel ${color}`}
                onClick={() => setWheelColor(color)}
                style={{
                  width: "100%", aspectRatio: '1/1', background: color,
                  border: wheelColor === color ? `2px solid #00ffff` : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", transition: '0.2s'
                }}
              />
            ))}
          </div>
        </div>

        {/* Suspension Section */}
        <div className="config-section">
          <label className="section-label">Suspension_Stance</label>
          <div className="toggle-group">
            <button 
              onClick={() => setStance("stock")} 
              className={`toggle-btn ${stance === "stock" ? 'active' : ''}`}
              style={{ borderRight: 'none' }}
            >
              FACTORY
            </button>
            <button 
              onClick={() => setStance("lowered")} 
              className={`toggle-btn ${stance === "lowered" ? 'active' : ''}`}
            >
              TRACK (LOWERED)
            </button>
          </div>
        </div>

        {/* Environment Section */}
        <div className="config-section">
          <label className="section-label">Environment_Render</label>
          <div className="toggle-group">
            <button 
              onClick={() => setEnvType("city")} 
              className={`toggle-btn ${envType === "city" ? 'active' : ''}`}
              style={{ borderRight: 'none' }}
            >
              DAYLIGHT
            </button>
            <button 
              onClick={() => setEnvType("night")} 
              className={`toggle-btn ${envType === "night" ? 'active' : ''}`}
            >
              MIDNIGHT
            </button>
          </div>
        </div>

        {/* Visual Matrix Section */}
        <div className="visual-matrix">
          <button 
            onClick={() => setIsExploded(!isExploded)}
            className={`toggle-btn ${isExploded ? 'active' : ''}`}
          >
            {isExploded ? "MERGE_ASSETS" : "EXPLODE_CHASSIS"}
          </button>
          
          <button 
            onClick={() => setAutoRotate(!autoRotate)}
            className={`toggle-btn ${autoRotate ? 'active' : ''}`}
            disabled={driveMode}
          >
            {autoRotate ? "MANUAL_ORBIT" : "CINEMATIC_ORBIT"}
          </button>
          
          <button 
            onClick={() => setDriveMode(!driveMode)}
            className={`action-btn ${driveMode ? 'active' : ''}`}
            style={{ margin: 0, borderRadius: 0 }}
          >
            {driveMode ? "EXIT_TEST_DRIVE" : "TEST_DRIVE (WASD)"}
          </button>
        </div>
        
        <button onClick={handleSnapshot} className="action-btn" style={{ marginTop: '20px' }}>
          CAPTURE_2D_SNAPSHOT
        </button>
      </aside>
      ) : (
        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <button 
            onClick={() => setDriveMode(false)}
            className="action-btn active"
            style={{ padding: '15px 40px', fontSize: '1.2rem', boxShadow: '0 0 20px #00ffff', borderRadius: '4px' }}
          >
            EXIT TEST DRIVE
          </button>
        </div>
      )}

      <Vehicle3DViewer 
        modelUrl={state.modelUrl} 
        accentColor={accentColor} 
        wheelColor={wheelColor}
        bodyFinish={bodyFinish}
        stance={stance}
        isExploded={isExploded}
        driveMode={driveMode}
        envType={envType}
        autoRotate={autoRotate}
      />
    </div>
  );
}
