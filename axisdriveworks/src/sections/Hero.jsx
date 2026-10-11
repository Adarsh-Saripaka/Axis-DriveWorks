import React, { useEffect, useRef } from "react";
import "./Hero.css";

const Hero = () => {
  const canvasRef = useRef();
  const heroRef = useRef();
  const contentRef = useRef();
  const silhouetteRef = useRef();

  useEffect(() => {
    let rAF;
    const handleMouseMove = (e) => {
      cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
        const x = (e.clientX / innerWidth - 0.5) * 16;
        const y = (e.clientY / innerHeight - 0.5) * -16;
        if (contentRef.current) {
          contentRef.current.style.transform = `translateZ(50px) rotateX(${y}deg) rotateY(${x}deg)`;
        }
        if (silhouetteRef.current) {
          silhouetteRef.current.style.transform = `translate(-50%, -50%) translateZ(-50px) rotateX(${y * 0.5}deg) rotateY(${x * 0.5}deg)`;
        }
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rAF);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 1.2;
        this.speedY = (Math.random() - 0.5) * 1.2;
        this.color = Math.random() > 0.5 ? "rgba(0,255,255,0.9)" : "rgba(255,0,150,0.9)";
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
      }
      draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particles = [];
    for (let i = 0; i < 45; i++) particles.push(new Particle());

    const connectParticles = () => {
      const len = particles.length;
      for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 10000) { // 100px max distance squared
            const distance = Math.sqrt(distSq);
            ctx.strokeStyle = `rgba(0,255,255,${0.35 * (1 - distance / 100)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }
      connectParticles();
      animId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      setCanvasSize();
      particles.forEach((p) => {
        if (p.x > canvas.width || p.y > canvas.height) {
          p.reset();
        }
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleExploreClick = (e) => {
    e.preventDefault();
    document.getElementById("brands")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="hero-container" ref={heroRef}>
      <canvas ref={canvasRef} className="particles-canvas" />
      
      {/* Floating 3D Silhouette */}
      <div 
        ref={silhouetteRef}
        className="hero-silhouette"
      />

      <div 
        ref={contentRef}
        className="hero-content"
      >
        <h1 className="logo-text">Axis DriveWorks</h1>
        <p className="tagline">When Engineering meets Elegance</p>
        <div className="cta-wrapper">
          <div className="cta-glow" />
          <a href="#brands" className="cta-btn" onClick={handleExploreClick}>Explore Now</a>
        </div>
      </div>
    </div>
  );
};

export default Hero;
