import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import os

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def create_audit_document(output_path):
    doc = docx.Document()
    
    # Page setup - 0.75 in margins
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)
        
    # Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Segoe UI'
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
    
    # Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("Axis DriveWorks — Comprehensive Technical Audit & Issue Inventory")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A) # Slate 900
    
    # Subtitle / Meta
    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(16)
    run_sub = sub_p.add_run("System Architecture, Security Vulnerabilities, Data Integrity, 3D Engine, & Frontend/Backend Defect Catalog")
    run_sub.font.size = Pt(11)
    run_sub.font.color.rgb = RGBColor(0x64, 0x74, 0x8B) # Slate 500
    
    # Overview Banner / Callout
    banner_table = doc.add_table(rows=1, cols=1)
    banner_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    banner_table.autofit = False
    cell = banner_table.rows[0].cells[0]
    cell.width = Inches(7.0)
    set_cell_background(cell, "F1F5F9")
    
    bp = cell.paragraphs[0]
    bp.paragraph_format.space_before = Pt(6)
    bp.paragraph_format.space_after = Pt(6)
    brun = bp.add_run("Executive Summary: This document serves as an exhaustive knowledge base and audit register detailing all identified security flaws, synthetic data anomalies, backend race conditions, 3D viewport rendering bugs, routing gaps, and missing features across the Axis DriveWorks platform.")
    brun.font.size = Pt(9.5)
    brun.font.italic = True
    brun.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    
    def add_heading_1(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(16)
        h.paragraph_format.space_after = Pt(6)
        h.paragraph_format.keep_with_next = True
        r = h.add_run(text)
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        return h

    def add_heading_2(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(10)
        h.paragraph_format.space_after = Pt(4)
        h.paragraph_format.keep_with_next = True
        r = h.add_run(text)
        r.font.size = Pt(12)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
        return h

    def add_bullet(bold_prefix, text):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(2)
        r_bold = p.add_run(bold_prefix + " ")
        r_bold.font.bold = True
        r_bold.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        r_text = p.add_run(text)
        r_text.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
        return p

    # --- SECTION 1 ---
    add_heading_1("1. Critical Security & Infrastructure Flaws")
    
    add_bullet("Exposed API Key Exposure:", 
               "Unsplash API keys exposed in plaintext in tracked files (render.yaml), client-side .env, and embedded in Vite frontend JS bundles (accessible via browser DevTools). Must be rotated and proxied solely through the backend.")
    add_bullet("Unauthenticated Reservations API & PII Leakage:", 
               "GET /api/reservations returns all customer names and emails with zero authentication. PUT .../complete and DELETE /api/reservations/completed allow arbitrary visitors to view, modify, or wipe all bookings globally. 'My Reservations' currently displays global user records.")
    add_bullet("Database Re-seed / Deployment Crash:", 
               "The reservations table is missing from initial DDL schemas and only exists in shipped SQLite binaries. Running seedDatabase.js deletes the SQLite file and rebuilds only cars, permanently destroying reservations and causing 500 errors on subsequent /api/reserve calls.")
    add_bullet("Ephemeral Storage on Render Free Tier:", 
               "The SQLite file is stored on an ephemeral container filesystem. Every service restart or redeployment purges all saved reservations. Requires persistent volume mounting or hosted database migration (PostgreSQL/Turso).")
    add_bullet("Broken Seed Script Dependency:", 
               "seedDatabase.js attempts to read axisdriveworks-backend/data/cardata.csv, but the 30MB CSV was placed exclusively in the frontend's public/ folder, breaking standalone backend initialization.")
    add_bullet("Deceptive Booking Confirmation UI:", 
               "Showcase.jsx ignores bookTestDrive() boolean return values, displaying 'Reservation Confirmed' and 'Check your email' even during network outages, rate limits, or 500 server crashes (with no email dispatch service existing).")
    add_bullet("NPM Audit Dependency Vulnerabilities:", 
               "Critical/High CVEs detected including React Router DOM open redirect leading to XSS vulnerabilities on the frontend and Undici vulnerabilities on the backend.")

    # --- SECTION 2 ---
    add_heading_1("2. Data Quality & Synthetic Dataset Issues (150k Fake Rows)")
    
    add_bullet("Synthetic / Hallucinated Records:", 
               "The first 150,000 rows are pseudo-randomly generated; only rows 150,001–150,032 represent realistic curated car specifications.")
    add_bullet("Absurd Pricing & Chronological Dates:", 
               "Ferrari average MSRP is listed as $42,303 while Toyota is $42,315. Ferrari F40 is dated 1913, Enzo 1924, Tesla Model S 1954, and 6,747 Tesla rows predate the company's 2008 founding.")
    add_bullet("Physically Impossible Performance Specs:", 
               "4,824 vehicles feature negative 0–100 km/h acceleration times; 94,180 claim 0-100 times under 1.5 seconds.")
    add_bullet("Mechanical Contradictions & Uniform Drivetrains:", 
               "V8 engine configurations paired with 2, 4, 5, or 11 cylinders. 150,009 out of 150,032 cars are classified as RWD. Random countries of origin (Toyota from Germany, Ferrari from South Korea).")
    add_bullet("Severe Model Repetition & Gaps:", 
               "13 main brands repeat ~10 distinct models across 11,700 rows with 12,272 duplicate brand/model/year groups. Brands with 3D models (Dodge, Mazda, Subaru, Maserati) lack database rows entirely.")
    add_bullet("Loss of Schema Typing & Truncated Columns:", 
               "All SQLite columns are stored as TEXT, preventing native numeric range queries and sorting. 18 of 33 CSV columns (displacement, fuel type, dimensions, safety ratings) are discarded.")
    add_bullet("Naive CSV Parsing & Public Bloat:", 
               "Seed parser uses raw line.split(',') which breaks on quoted commas. The unused 30MB cardata.csv is unnecessarily shipped in public/ and dist/.")

    # --- SECTION 3 ---
    add_heading_1("3. Backend Weaknesses, Crashes & Robustness")
    
    add_bullet("Express 5 Body Destructuring Crash:", 
               "Missing or non-JSON request bodies cause unhandled exceptions and 500 crashes due to undefined req.body destructuring.")
    add_bullet("Array Query String Crash (/api/search?q=a&q=b):", 
               "Passing duplicate query parameters converts req.query.q into an array, causing .trim() to throw unhandled 500 errors.")
    add_bullet("SQL LIKE Wildcard Injection:", 
               "Unescaped '%' and '_' in search queries allow inputs like ?q=% to trigger full-table wildcard scans bypassing filtering.")
    add_bullet("Unsanitized Reservation Payloads:", 
               "/api/reserve accepts invalid emails ('notanemail'), dates in the past (1999), and unescaped XSS payloads (<script>) with no length constraints or relational car verification.")
    add_bullet("PUT /complete Silent False Positive:", 
               "Calling complete on non-existent booking IDs returns 200 OK success without validating row existence.")
    add_bullet("Slow Full-Table LIKE Scanning:", 
               "4-column leading wildcard LIKE queries perform unindexed table scans across 150k rows with no pagination, no total counts, and arbitrary LIMIT 35 truncations. Needs SQLite FTS5.")
    add_bullet("Rate Limiter Memory Leak & Proxy Bypass:", 
               "In-memory rateMap has no cleanup mechanism. Missing trust proxy configuration causes all Render users behind reverse proxies to share a single IP bucket.")
    add_bullet("Server Startup Race Condition:", 
               "Database initialization runs asynchronously while HTTP listen() activates immediately; missing DB files leave servers permanently returning 503 errors without automatic retry.")
    add_bullet("Missing Production Middleware:", 
               "No Helmet security headers, missing Gzip compression, SQLite missing WAL mode, and CORS mismatch with Render service names.")

    # --- SECTION 4 ---
    add_heading_1("4. Frontend Routing, State & UI Defects")
    
    add_bullet("Broken Showcase Navigation:", 
               "/showcase direct visits fail to redirect properly due to truthy default state ('Cars'), rendering blank components.")
    add_bullet("Render SPA 404 Refresh Failures:", 
               "Missing SPA rewrite rules (/index.html) in render.yaml cause deep links (/models, /brand/BMW, /bookings) to 404 on page refresh.")
    add_bullet("Dead Routes & Global Shell Inconsistency:", 
               "/privacy and /terms link to 404 pages. Global Header and Footer only exist on Home, stripping navigation across inner routes.")
    add_bullet("Fragile 3D Viewer Route Coupling:", 
               "/viewer relies strictly on React Router transient state rather than URL slugs/IDs, causing direct links or new tabs to fail.")
    add_bullet("Image Quota Exhaustion & Lack of Caching:", 
               "Client-side image calls exhaust API tiers immediately (up to 105 calls per brand page view) with no caching, flickering loaders, and unsynced hero vs card photos.")
    add_bullet("UX Race Conditions & Spec Discrepancies:", 
               "Lack of AbortController allows stale async fetches to overwrite newer UI states. Inconsistent currency/HP formatting and generic placeholders shown for missing data.")
    add_bullet("Booking Form Flaws:", 
               "Allows past date reservations, lacks submit button debouncing, and immediately marks drives complete before launching the 3D model.")

    # --- SECTION 5 ---
    add_heading_1("5. 3D Viewer & WebGL Rendering Engine Bugs")
    
    add_bullet("Mesh Manifest Naming Mismatches:", 
               "Manifests target hardcoded names like 'Body'/'Door_L' while actual GLBs (Ferrari 488, Honda Civic, VW Golf) use 'Object_N' or 'M_Chassis_Max', preventing vehicle paint customization.")
    add_bullet("Shared Material Mutation Bug:", 
               "Three.js scene.clone() does not deep-clone materials; painting a mesh mutates cached originals, overwriting wheel materials and making 'stock' resets impossible.")
    add_bullet("Broken Exploded & Stance View Transforms:", 
               "Exploded view shifts meshes in unnormalized local coordinates (moving everything non-left to +X); lowered stance shifts meshes by fixed 0.15 units ignoring model scale.")
    add_bullet("Frame-Rate Dependent Driving Physics:", 
               "Vehicle deceleration uses velocity *= 0.92 per frame without delta-time scaling, altering physics at 30fps vs 120fps. Lacks max speed clamps and arrow key preventDefault.")
    add_bullet("Massive Uncompressed 3D Assets (20–65 MB each):", 
               "Models lack Draco, Meshopt, or KTX2 texture compression. Hovering preview cards preloads full multi-megabyte GLB assets over cellular connections.")
    add_bullet("WebGL Memory Leaks & Old Branding:", 
               "Textures and geometries are not disposed on component unmount. Canvas snapshots are hardcoded with legacy 'autovision_snapshot' naming.")

    # --- SECTION 6 ---
    add_heading_1("6. Performance, Build & Accessibility Deficiencies")
    
    add_bullet("Heavy Initial Bundle Weight:", 
               "Three.js and Drei (~1.2 MB uncompressed) are bundled directly into the landing page entry point without React.lazy code-splitting.")
    add_bullet("High-CPU Particle Canvas:", 
               "Home hero canvas executes ~11,000 distance calculations per frame continuously even when scrolled out of view, ignoring devicePixelRatio and reduced-motion preferences.")
    add_bullet("Accessibility (a11y) Barriers:", 
               "Interactive brand cards use raw <div> tags without role='button' or tabIndex; search/swatch buttons lack aria-labels; booking modal lacks focus trap or ESC handlers.")
    add_bullet("SEO & Social Metadata Gaps:", 
               "Missing Open Graph / Twitter image cards, static titles across all routes, and no sitemap.xml or robots.txt.")

    # --- SECTION 7 ---
    add_heading_1("7. Missing Production Capabilities & Architecture Roadmap")
    
    add_bullet("Authentication & User Accounts:", 
               "Requires JWT/Session authentication, user-specific booking dashboards, cancellation/rescheduling workflows, and email confirmation dispatch.")
    add_bullet("Advanced Vehicle Discovery:", 
               "Faceted filtering (MSRP range, body style, powertrain, year), paginated server queries, vehicle comparison tools, and search autocomplete.")
    add_bullet("Enhanced 3D Showroom:", 
               "Interior cabin camera presets, interactive hotspot annotations, wheel/aerokit swap options, mobile touch/gyro controls, and shareable configuration URLs.")
    add_bullet("Enterprise Operations:", 
               "Real-time error telemetry (Sentry), CDN asset hosting (S3/Cloudflare R2), automated CI/CD test suites, and database migration tooling.")

    # Save
    doc.save(output_path)
    print(f"Successfully created: {output_path}")

if __name__ == "__main__":
    out_file = r"c:\Users\Surface\OneDrive\WebDevelopment\Axis_DriveWorks_Comprehensive_Audit_and_Issue_Report.docx"
    create_audit_document(out_file)
