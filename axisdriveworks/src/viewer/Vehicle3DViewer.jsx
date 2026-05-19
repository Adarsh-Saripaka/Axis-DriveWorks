import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Html,
  useProgress,
  ContactShadows,
  Center,
  Environment,
  Grid
} from "@react-three/drei";
import React, { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MODEL_MANIFEST, smartMatchMaterial } from "./modelConfig";

// Use default built-in draco decoder from drei by passing true to useGLTF

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#00ffff', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>ENGINE STALL</h2>
            <p style={{ color: '#666' }}>The 3D showroom is reloading assets...</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', background: '#00ffff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>RESTART ENGINE</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Model({ url, color, wheelColor, bodyFinish, isExploded, stance }) {
  const { scene } = useGLTF(url, true);
  const initialPositions = useRef(new Map());

  // Find manifest entry based on URL
  const modelKey = useMemo(() => {
    return Object.keys(MODEL_MANIFEST).find(key => url.includes(key)) || null;
  }, [url]);

  const model = useMemo(() => {
    const clone = scene.clone();

    // Scale Normalization Logic
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = (MODEL_MANIFEST[modelKey]?.scale || 2.2) / maxDim;
    clone.scale.setScalar(scale);

    // Force the bottom of the tires to rest exactly on Y = 0, and center X/Z
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = scaledBox.getCenter(new THREE.Vector3());
    
    clone.position.x = -center.x;
    clone.position.z = -center.z;
    clone.position.y = -scaledBox.min.y;

    // Store initial positions for Exploded View
    clone.traverse((child) => {
      if (child.isMesh) {
        initialPositions.current.set(child.uuid, child.position.clone());
      }
    });

    return clone;
  }, [scene, modelKey]);

  useEffect(() => {
    const config = MODEL_MANIFEST[modelKey];

    model.traverse((child) => {
      if (child.isMesh) {
        const meshName = child.name.toLowerCase();
        const originalPos = initialPositions.current.get(child.uuid);

        if (!originalPos) return;
        child.position.copy(originalPos);

        // Determine if part should be colored using Manifest (Primary) or Smart Match (Fallback)
        let isPaint = config?.paintParts?.includes(child.name);
        let isWheel = config?.wheelParts?.includes(child.name);
        let isGlass = config?.exclusionParts?.includes(child.name);

        if (isPaint === undefined) {
          const matched = smartMatchMaterial(child.name, child.material?.name ?? "");
          isPaint = matched.isPaint;
          isWheel = matched.isWheel;
          isGlass = matched.isGlass;
        }

        // Apply Colors
        if (isPaint && !isGlass) {
          child.material.color.set(color);
          
          if (bodyFinish === "matte") {
            child.material.roughness = 0.7;
            child.material.metalness = 0.1;
          } else if (bodyFinish === "gloss") {
            child.material.roughness = 0.1;
            child.material.metalness = 0.2;
          } else { // metallic
            child.material.roughness = 0.2;
            child.material.metalness = 0.8;
          }
        }

        if (isWheel && !isGlass) {
          child.material.color.set(wheelColor);
        }

        // Exploded View Logic
        if (isExploded) {
          if (meshName.includes("wheel") || meshName.includes("rim") || meshName.includes("tire")) {
            child.position.x += meshName.includes("left") ? -0.8 : 0.8;
          }
          if (meshName.includes("door") || meshName.includes("hood") || meshName.includes("trunk") || meshName.includes("boot")) {
            child.position.y += 0.6;
            child.position.z += meshName.includes("hood") ? 0.4 : -0.4;
          }
        } else if (stance === "lowered") {
          if (!(meshName.includes("wheel") || meshName.includes("rim") || meshName.includes("tire") || meshName.includes("brake"))) {
             child.position.y -= 0.15; // lower chassis for track stance
          }
        }
      }
    });
  }, [model, color, wheelColor, bodyFinish, isExploded, stance, modelKey]);

  return <primitive object={model} />;
}

function DriveController({ driveMode, targetRef }) {
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, arrowup: false, arrowdown: false, arrowleft: false, arrowright: false });
  const velocity = useRef(0);
  const rotation = useRef(0);
  const prevPosition = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!driveMode) return;
    const handleKeyDown = (e) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: true }));
    const handleKeyUp = (e) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: false }));
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      setKeys({ w: false, a: false, s: false, d: false, arrowup: false, arrowdown: false, arrowleft: false, arrowright: false });
      velocity.current = 0;
    };
  }, [driveMode]);

  useFrame((state, delta) => {
    if (!driveMode || !targetRef.current) return;
    
    // W/ArrowUp is forward, S/ArrowDown is backward
    if (keys.w || keys.arrowup) velocity.current += 15 * delta;
    if (keys.s || keys.arrowdown) velocity.current -= 15 * delta;
    
    velocity.current *= 0.92; // friction
    
    if (Math.abs(velocity.current) > 0.05) {
      const turnSpeed = 2 * delta * (velocity.current > 0 ? 1 : -1);
      if (keys.a || keys.arrowleft) rotation.current += turnSpeed;
      if (keys.d || keys.arrowright) rotation.current -= turnSpeed;
    }

    // Save previous position to calculate delta
    prevPosition.current.copy(targetRef.current.position);

    // Update car position (Forward is positive Z when rotated, but Math.sin/cos depends on standard axis)
    // Moving along the local Z axis
    targetRef.current.position.x += Math.sin(rotation.current) * velocity.current * delta;
    targetRef.current.position.z += Math.cos(rotation.current) * velocity.current * delta;
    targetRef.current.rotation.y = rotation.current;

    // Follow Camera while allowing user rotation via OrbitControls
    if (state.controls) {
      const deltaX = targetRef.current.position.x - prevPosition.current.x;
      const deltaZ = targetRef.current.position.z - prevPosition.current.z;
      
      // Move camera by the exact same amount the car moved
      state.camera.position.x += deltaX;
      state.camera.position.z += deltaZ;
      
      // Update controls target to the car's new position
      state.controls.target.copy(targetRef.current.position);
      state.controls.update();
    }
  });

  if (!driveMode) return null;

  return (
    <Grid 
      infiniteGrid 
      fadeDistance={80} 
      cellColor="#00ffff" 
      sectionColor="#0088ff" 
      position={[0, 0, 0]} 
    />
  );
}

export default function Vehicle3DViewer({
  modelUrl,
  accentColor = "#ffffff",
  wheelColor = "#ffffff",
  bodyFinish = "metallic",
  stance = "stock",
  isExploded = false,
  driveMode = false,
  envType = "city",
  autoRotate = false
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const carGroup = useRef();

  if (!modelUrl) return null;

  return (
    <ErrorBoundary>
      <div style={{ width: "100%", height: "100vh", background: "#050505" }}>
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true }}
          camera={{
            position: isMobile ? [5, 3, 5] : [4, 2, 4],
            fov: isMobile ? 50 : 35
          }}
        >
          <Suspense fallback={<LoadingFallback />}>
            {/* ✅ Explicit lighting — more stable than Stage across drei versions */}
            <Environment
              preset={envType === "city" ? "city" : "night"}
              background={false}
            />
            <ambientLight intensity={envType === "city" ? 0.6 : 0.2} />
            <directionalLight
              position={[5, 8, 5]}
              intensity={envType === "city" ? 1.5 : 0.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <directionalLight position={[-5, 3, -5]} intensity={0.3} />

            {/* Vehicle Group */}
            <group ref={carGroup}>
              <Model
                url={modelUrl}
                color={accentColor}
                wheelColor={wheelColor}
                bodyFinish={bodyFinish}
                isExploded={isExploded}
                stance={stance}
              />
            </group>

            <DriveController driveMode={driveMode} targetRef={carGroup} />

            <ContactShadows
              position={[0, 0, 0]}
              opacity={0.6}
              scale={15}
              blur={2.5}
              far={1}
            />
          </Suspense>

          <OrbitControls
            enablePan={false}
            minDistance={3.5}
            maxDistance={12}
            maxPolarAngle={Math.PI / 2.1}
            autoRotate={autoRotate}
            autoRotateSpeed={0.5}
            makeDefault
          />
        </Canvas>
      </div>
    </ErrorBoundary>
  );
}

function LoadingFallback() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        color: "#00ffff",
        background: "rgba(0,0,0,0.9)",
        padding: "30px 60px",
        borderRadius: "20px",
        border: "1px solid rgba(0,255,255,0.3)",
        backdropFilter: "blur(10px)",
        textAlign: "center",
        minWidth: '250px'
      }}>
        <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: '#00ffff',
            transition: 'width 0.3s ease',
            boxShadow: '0 0 10px #00ffff'
          }} />
        </div>
        <span style={{ fontSize: "12px", letterSpacing: '4px', textTransform: 'uppercase' }}>Synchronizing Assets</span>
        <span style={{ fontSize: "42px", fontWeight: "900", fontFamily: 'monospace' }}>{progress.toFixed(0)}%</span>
      </div>
    </Html>
  );
}
