# Axis DriveWorks

**Interactive 3D Car Configurator & Vehicle Search Platform**

---

## Project Overview

Axis DriveWorks is a full‑stack 3D car configurator and vehicle search platform. Users can search a massive vehicle dataset, view detailed specifications, reserve test drives, and explore interactive 3D models with real‑time customization.

---

## New Features

- **Test‑Drive Scheduler** – Reserve a test drive; bookings are stored in local storage and listed on a dedicated *My Reservations* page.
- **WASD Driving Controller** – Engage *Test Drive* mode to drive the vehicle on an infinite neon grid.
- **Exploded View & Stance Options** – Separate chassis components, toggle factory or lowered (track) stance.
- **Dynamic Paint & Wheel Colors** – Choose from a curated palette with live updates.
- **Responsive Mobile Layout** – Optimized UI for tablets & phones, collapsible configuration sidebar.
- **Backend Rate Limiting & Security Headers** – Limits to 60 requests/min per IP and hardened HTTP headers.
- **Zoom‑free UI** – All zoom‑in/out controls removed for a cleaner experience.

---

## System Architecture

```mermaid
graph TD
    subgraph Client [React Frontend]
        UI[User Interface]
        GL[Three.js / React‑Three‑Fiber Canvas]
        Drive[WASD Driving Controller]
        Storage[(Local Storage – Bookings)]
    end
    subgraph Server [Node.js Express Backend]
        API[API Endpoints]
        CSVReader[CSV Stream Parser]
        Assets[Static Asset Server]
        Limiter[Rate Limiter & Security]
    end
    subgraph Data [Data Layer]
        CSV[(cardata.csv – 150k+ rows)]
        Models3D[(data/axisdriveworks-3d-assets)]
    end
    subgraph External [External APIs]
        Unsplash[Unsplash Photo API]
    end
    UI <-->|Bookings| Storage
    UI -->|Search/API Requests| Limiter
    Limiter --> API
    API -->|Read CSV| CSVReader
    CSVReader -->|Stream Lines| CSV
    API -->|JSON Results| UI
    GL -->|Load GLB/GLTF| Assets
    Assets -->|Serve Models| Models3D
    UI -->|Image Queries| Unsplash
    Unsplash -->|Photo URLs| UI
```

---

## How the Website Works

```mermaid
graph TD
    Start([Landing Page]) --> Search[Search & Explore]
    Search -->|Query| BackendSearch[Express Backend]
    BackendSearch -->|Read CSV| Results[Display Results & Unsplash Images]
    Results -->|Select Car| Showcase[Vehicle Showcase & Specs]
    Showcase -->|Reserve| BookForm[Reservation Form]
    BookForm -->|Save| LocalSave[(LocalStorage)]
    LocalSave --> Bookings[My Reservations]
    Bookings -->|Start Test Drive| Viewer[3D Configurator]
    Showcase -->|Direct 3D| Viewer
    Viewer -->|Render GLB| Canvas[Three.js Canvas]
    Canvas -->|Customize| Config{Options}
    Config -->|Paint Finish| Finish[Matte / Gloss / Metallic]
    Config -->|Colors| Palette[Update Colors]
    Config -->|Stance| Stance[Factory / Lowered]
    Config -->|Explode| Explode[Chassis Explode]
    Config -->|Snapshot| Snapshot[Save PNG]
    Canvas -->|Test Drive| DriveMode[Active Drive]
    DriveMode -->|WASD| Movement[Translate Car]
    Movement -->|Camera Follow| Camera[Dynamic Camera]
```

---

## Folder Structure

```bash
axis-driveworks/
├── axisdriveworks/              # Frontend React Application
│   ├── public/                  # Static assets (logo, fallback CSV)
│   │   ├── Logo.png
│   │   └── cardata.csv
│   ├── src/
│   │   ├── Api/                 # API service logic
│   │   │   └── FetchApi.js
│   │   ├── images/              # UI icons & images
│   │   ├── sections/            # Page components
│   │   │   ├── BookingsPage.css / BookingsPage.jsx   # Reservations dashboard (new)
│   │   │   ├── BrandCard.css / BrandCard.jsx
│   │   │   ├── BrandPage.css / BrandPage.jsx
│   │   │   ├── Footer.css / Footer.jsx
│   │   │   ├── Hero.css / Hero.jsx
│   │   │   ├── Search.css / Search.jsx
│   │   │   ├── Showcase.css / Showcase.jsx
│   │   │   └── VehicleCard.css / VehicleCard.jsx
│   │   ├── viewer/              # 3D viewer modules
│   │   │   ├── modelConfig.js
│   │   │   ├── ModelRegistry.jsx
│   │   │   ├── ModelsLibrary.css / ModelsLibrary.jsx
│   │   │   ├── Vehicle3DViewer.jsx
│   │   │   └── ViewerPage.css / ViewerPage.jsx
│   │   ├── App.css / App.jsx    # Router & layout
│   │   ├── index.css            # Global CSS tokens & theme
│   │   └── main.jsx             # React entry point
│   ├── package.json
│   └── vite.config.js
│
├── axisdriveworks-backend/      # Express.js REST API
│   ├── data/
│   │   ├── axisdriveworks-3d-assets/ # GLB/GLTF assets
│   │   └── cardata.csv               # Vehicle database (151k+ rows)
│   ├── server.js
│   └── package.json
│
├── render.yaml                  # Render.com multi‑service config
└── README.md                    # Project documentation (this file)
```

---

## Environment Variables

### Frontend (`.env`)
```env
VITE_API_URL=http://localhost:3000
VITE_UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```
### Backend (`.env`)
```env
PORT=3000
FRONTEND_URL=http://localhost:5173
```
---

## Installation & Setup

1. **Backend**
   ```bash
   cd axisdriveworks-backend
   npm install
   cp .env.example .env   # set PORT & FRONTEND_URL
   node server.js
   ```
2. **Frontend**
   ```bash
   cd axisdriveworks
   npm install
   cp .env.example .env   # set VITE_API_URL & UNSPLASH key
   npm run dev
   ```
---

## Usage

- Open `http://localhost:5173`.
- Search for a brand/model; view results with images.
- Click a car to open the **Showcase** page.
- Use the **Reserve for Test Drive** button to schedule a test drive (saved locally).
- In the **Viewer** page, customize paint, wheels, stance, explode the chassis, or enter **Test Drive** mode with WASD controls.
- Capture a snapshot with the **Capture 2D Snapshot** button.
---

## Future Improvements

- Add persistent user accounts & cloud storage for bookings.
- Replace CSV with a relational database (PostgreSQL/MongoDB).
- Implement PBR materials for realistic rendering.
- Expand backend API for advanced filters (price, engine, drivetrain).
---

## Author

**Adarsh Saripaka**
