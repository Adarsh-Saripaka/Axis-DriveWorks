#!/usr/bin/env python3
"""
build_car_names.py
Builds a clean, de-duplicated car NAME list (no specs) for search/autocomplete/brand pages.

Inputs  (CSV files, names only are used):
  Car_Models-selected-columns.csv
  Cars_Datasets_2025-selected-columns.csv
Outputs:
  car_names.csv, car_names.json, data_report.md
Usage:
  python build_car_names.py <input_dir> <output_dir>
"""
import sys, re, json, csv
from collections import Counter, defaultdict
import pandas as pd

IN = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "."

# ---------- brand normalisation ----------
BRAND_ALIASES = {
    "mercedes": "Mercedes-Benz", "mercedes-benz": "Mercedes-Benz",
    "rolls royce": "Rolls-Royce", "rolls-royce": "Rolls-Royce",
    "tata motors": "Tata", "lucid motors": "Lucid", "mini": "MINI",
    "maruti suzuki": "Maruti Suzuki", "aston martin": "Aston Martin",
    "alfa romeo": "Alfa Romeo", "land rover": "Land Rover",
    "citroën": "Citroën", "bmw": "BMW", "gmc": "GMC", "seat": "SEAT", "kia": "Kia",
    "mclaren": "McLaren", "faraday future": "Faraday Future",
}
def norm_brand(b):
    b = re.sub(r"\s+", " ", str(b).strip())
    k = b.lower()
    if k in BRAND_ALIASES: return BRAND_ALIASES[k]
    return b if not b.isupper() or len(b) <= 3 else b.title()

# explicit fixes for rows whose model starts with another brand's name
PREFIX_BRAND_FIX = [
    ("Dodge", r"^RAM\s+", "Ram"),
    ("Volvo", r"^Polestar\s+", "Polestar"),
    ("Nissan", r"^Infiniti\s+", "Infiniti"),
    ("BMW", r"^McLaren\s+", "McLaren"),
]
def split_jlr(model):
    m = model.strip()
    if m.lower().startswith("jaguar "): return "Jaguar", m[7:]
    if m.lower().startswith("land rover "): return "Land Rover", m[11:]
    return "Land Rover", m  # Range Rover / Defender / Discovery / Evoque etc.

KEEP_UPPER = {"GT","GTS","GTC","GTB","RS","SVJ","STO","AMG","SUV","EV","EVO","XL","LX","RX","NX","UX","GX","LC","LS","ES","IS","CT","RC","SL","SLC","SLK","CLS","CLA","GLA","GLC","GLE","GLS","GLB","EQS","EQE","EQB","EQC","XC","XT","XTS","CTS","ATS","SRT","STI","WRX","TT","SQ","RSQ","ID","ZR","ZL","SS","LT","LS","RST","LTZ","VX","VXR","ST","SE","SEL","SV","SR","SL","DB","DBS","DBX","DB11","DB12","MC","XJ","XF","XE","XK","SVR","SVO","TRX","TRD","XRS","CX","MX","MG","BT","CR","HR","BR","FR","NSX","GR","RAV4","UV","XUV","TUV","KUV","GLK","SLS","SLR","CC","GTI","GLI","TDI","TSI","GTD","GTE","R8","Q3","Q5","Q7","Q8","A3","A4","A5","A6","A7","A8","S3","S4","S5","S6","S7","S8","RS3","RS4","RS5","RS6","RS7","M2","M3","M4","M5","M6","M8","X1","X2","X3","X4","X5","X6","X7","Z4","I3","I4","I7","I8","IX"}
def smart_title(s):
    if not s.isupper(): return s
    out = []
    for tok in s.split(" "):
        base = re.sub(r"[^A-Z0-9]", "", tok)
        if base in KEEP_UPPER or any(c.isdigit() for c in tok) or len(base) <= 2:
            out.append(tok)
        else:
            out.append(tok.capitalize())
    return " ".join(out)

FORCE_UPPER = {"GT","GTS","GTB","GTC","GTE","GTI","GTD","RS","SVJ","STO","AMG","SRT","STI","WRX","SS","SUV","LX","TRD","SVR"}
MOJIBAKE = {"Proteg\ufffd": "Protegé", "Proteg\ufffd ": "Protegé"}
def clean_model(m, brand=None):
    m = str(m).replace("\u00a0", " ").strip().rstrip("*").strip()
    m = re.sub(r"\s+", " ", m)
    for bad, good in MOJIBAKE.items(): m = m.replace(bad, good)
    m = smart_title(m)
    # strip a leading brand name repeated inside the model ("Toyota 86" under Toyota)
    if brand:
        for pref in {brand, brand.split(" ")[0], "Mercedes" if brand == "Mercedes-Benz" else brand}:
            mm = re.match(rf"^{re.escape(pref)}\s+(.+)$", m, re.I)
            if mm and mm.group(1): m = mm.group(1); break
    # fix tokens like Gt -> GT, Gt-r -> GT-R
    parts = []
    for tok in m.split(" "):
        sub = "-".join(p.upper() if p.upper() in FORCE_UPPER or (p.lower()=="r" and "-" in tok and tok.lower().startswith("gt")) else p for p in tok.split("-"))
        parts.append(sub)
    m = " ".join(parts)
    if brand == "BMW":
        m = re.sub(r"^I([0-9]|X)\b", lambda x: "i"+x.group(1).lower() if x.group(1)!="X" else "iX", m)
    return m

def key(s):  # dedupe key
    return re.sub(r"[^a-z0-9]", "", s.lower())

def parse_years(s):
    if pd.isna(s): return None, None
    s = str(s).lower()
    yrs = re.findall(r"(19\d{2}|20\d{2})", s)
    if not yrs: return None, None
    start = int(yrs[0])
    if "present" in s or len(yrs) == 1: end = None
    else: end = int(yrs[1])
    return start, end

# ---------- load ----------
d2 = pd.read_csv(f"{IN}/Car_Models-selected-columns.csv")
d3 = pd.read_csv(f"{IN}/Cars_Datasets_2025-selected-columns.csv")

rows, dropped = [], Counter()
fixes = []

def add(brand, model, ys, ye, src):
    brand = norm_brand(brand); model = clean_model(model, brand)
    for b0, pat, nb in PREFIX_BRAND_FIX:
        if brand == b0 and re.match(pat, model, re.I):
            fixes.append(f"{brand} | {model}  ->  {nb} | {re.sub(pat,'',model,flags=re.I)}")
            brand, model = nb, re.sub(pat, "", model, flags=re.I)
            break
    if not model: dropped["empty model"] += 1; return
    rows.append(dict(brand=brand, model=model, year_start=ys, year_end=ye, source=src))

for _, r in d2.iterrows():
    ys, ye = parse_years(r["Model Year Range"])
    add(r["Company"], r["Model"], ys, ye, "Car_Models")

for _, r in d3.iterrows():
    price = str(r["Cars Prices"])
    if "concept" in price.lower():
        dropped["concept-only (D3)"] += 1; continue
    brand = r["Company Names"]
    model = str(r["Cars Names"])
    if norm_brand(brand) == "Jaguar Land Rover" or str(brand).strip().lower() == "jaguar land rover":
        brand, model = split_jlr(model)
    add(brand, model, None, None, "Cars_Datasets_2025")

# ---------- 3D model registry (from ModelRegistry.jsx) ----------
# id, brand, canonical model name, year_start, year_end, regex used to match an existing row
REG = [
 ("aston_vantage","Aston Martin","Vantage Roadster",None,None,r"^vantage"),
 ("audi_r8","Audi","R8",2008,None,r"^r8$"),
 ("audi_rs7","Audi","RS7",2014,None,r"^rs ?7"),
 ("bmw_m4","BMW","M4 Competition",2021,None,r"^m4 competition$"),
 ("bmw_i8","BMW","i8",2015,None,r"^i8"),
 ("bmw_m3","BMW","M3",None,None,r"^m3$"),
 ("chevy_camaro","Chevrolet","Camaro SS",2016,None,r"^camaro ss"),
 ("chevy_corvette","Chevrolet","Corvette Stingray",2020,None,r"^corvette"),
 ("ferrari_488","Ferrari","488 GTB",2016,None,r"^488 gtb"),
 ("ferrari_f8","Ferrari","F8 Tributo",2020,None,r"^f8 tributo$"),
 ("ford_dodge","Dodge","Challenger SRT Hellcat",2018,None,r"^challenger"),
 ("ford_f150","Ford","F-150 Raptor",2018,None,r"^f-?150 raptor"),
 ("ford_mus","Ford","Mustang GT",1968,None,r"^mustang$"),
 ("honda_civic","Honda","Civic Type R",2024,None,r"^civic type r"),
 ("honda_nsx","Honda","NSX",1990,None,r"^nsx"),
 ("hyundai_tucson","Hyundai","Tucson",2015,None,r"^tucson"),
 ("hyundai_veloster","Hyundai","Veloster N",2021,None,r"^veloster"),
 ("hyundai_elantra","Hyundai","Elantra N",2022,None,r"^elantra n"),
 ("hyundai_creta","Hyundai","Creta",2016,None,r"^creta"),
 ("hyundai_sonata","Hyundai","Sonata",2009,None,r"^sonata"),
 ("rx7","Mazda","RX-7",None,None,r"^rx-?7"),
 ("subaru","Subaru","Impreza WRX",None,None,r"^impreza"),
 ("lambo_hur","Lamborghini","Huracan GT",2019,None,r"^hurac.n evo$|^hurac.n$"),
 ("lambo_ave","Lamborghini","Aventador SVJ Roadster",2020,None,r"^aventador svj roadster$"),
 ("maserati","Maserati","GranTurismo MC Stradale",None,None,r"^gran ?turismo"),
 ("mclaren","McLaren","720S",2017,None,r"^720s$"),
 ("mercedes_amg","Mercedes-Benz","AMG GT",None,None,r"^amg gt$|^gt$"),
 ("nissan_370z","Nissan","370Z",None,None,r"^370z"),
 ("nissan_gtr","Nissan","GT-R",None,None,r"^gt-?r$"),
 ("porsche_cay","Porsche","Cayman S",2014,None,r"^cayman s$|^cayman$"),
 ("porsche_pan","Porsche","Panamera Turbo S",2021,None,r"^panamera turbo s"),
 ("porsche_tay","Porsche","Taycan Turbo S",None,None,r"^taycan turbo s$"),
 ("tesla_cyber","Tesla","Cybertruck",None,None,r"^cybertruck"),
 ("toyota_land","Toyota","Land Cruiser",2022,None,r"^land cruiser"),
 ("toyota_supra","Toyota","GR Supra",None,None,r"^gr supra$|^supra$"),
 ("vw_golf","Volkswagen","Golf",1983,1992,r"^golf$"),
]
# "mercedes_low" (generic low-poly Mercedes) intentionally skipped: not a real model.

# ---------- merge + dedupe ----------
merged = {}
for r in rows:
    k = (r["brand"].lower(), key(r["model"]))
    if k not in merged:
        merged[k] = dict(r, sources={r["source"]})
    else:
        m = merged[k]; m["sources"].add(r["source"])
        if m["year_start"] is None and r["year_start"] is not None:
            m["year_start"], m["year_end"] = r["year_start"], r["year_end"]
        dropped["duplicate merged"] += 1

for k, m in merged.items():
    m["has_3d_model"] = 0; m["model_3d_id"] = None; m["model_3d_label"] = None

reg_report = []
LABELS = {"aston_vantage":"Vantage Roadster","audi_r8":"Audi R8","audi_rs7":"2014 Audi RS7","bmw_m4":"2021 BMW M4 Competition","bmw_i8":"2015 BMW i8 XS","bmw_m3":"BMW M3 Sedan","chevy_camaro":"2016 Camaro SS","chevy_corvette":"2020 Corvette C8","ferrari_488":"2016 Ferrari 488 GTB","ferrari_f8":"2020 Ferrari F8 Tributo","ford_dodge":"Challenger SRT Hellcat","ford_f150":"2018 F-150 Raptor","ford_mus":"1968 Mustang GT","honda_civic":"2024 Civic Type-R","honda_nsx":"1990 Honda NSX","hyundai_tucson":"2015 Tucson","hyundai_veloster":"2021 Veloster N","hyundai_elantra":"2022 Elantra N","hyundai_creta":"2016 Creta","hyundai_sonata":"2009 Sonata","rx7":"Mazda RX-7","subaru":"Impreza WRX","lambo_hur":"2019 Huracan GT","lambo_ave":"Aventador SVJ 63","maserati":"GranTurismo Stradale","mclaren":"2017 McLaren 720s","mercedes_amg":"Mercedes AMG GT","nissan_370z":"Nissan 370Z Z34","nissan_gtr":"Aimgain GT R35","porsche_cay":"2014 Cayman S","porsche_pan":"2021 Panamera Turbo","porsche_tay":"Taycan Turbo S","tesla_cyber":"Cybertruck Modified","toyota_land":"2022 Land Cruiser","toyota_supra":"Supra MK5 A90","vw_golf":"VW Golf II"}
year_conflicts = []
for rid, brand, name, ys, ye, pat in REG:
    cand = [m for m in merged.values() if m["brand"].lower() == brand.lower() and re.search(pat, m["model"].lower())]
    if cand:
        best = min(cand, key=lambda m: len(m["model"]))
        best["has_3d_model"] = 1; best["model_3d_id"] = rid; best["model_3d_label"] = LABELS[rid]
        yr = re.match(r"^(19|20)\d{2}", LABELS[rid])
        if yr and best["year_start"] and (int(yr.group(0)) < best["year_start"] or (best["year_end"] and int(yr.group(0)) > best["year_end"])):
            year_conflicts.append(f"{best['brand']} {best['model']}: row says {best['year_start']}-{best['year_end'] or 'present'} but 3D model is {LABELS[rid]}")
        best["sources"].add("3d_registry")
        reg_report.append((rid, f"{best['brand']} {best['model']}", "matched existing"))
    else:
        k = (brand.lower(), key(name))
        merged[k] = dict(brand=brand, model=name, year_start=None, year_end=None, source="3d_registry",
                         sources={"3d_registry"}, has_3d_model=1, model_3d_id=rid, model_3d_label=LABELS[rid])
        reg_report.append((rid, f"{brand} {name}", "ADDED (not in datasets)"))

final = sorted(merged.values(), key=lambda m: (m["brand"].lower(), m["model"].lower()))
for i, m in enumerate(final, 1):
    m["id"] = i
    m["body_style"] = None  # not present in source files; fill later (EPA / vPIC)
    m["sources"] = "|".join(sorted(m["sources"]))
    m["search_key"] = re.sub(r"\s+", " ", f"{m['brand']} {m['model']}".lower()).strip()

cols = ["id","brand","model","year_start","year_end","body_style","has_3d_model","model_3d_id","model_3d_label","sources","search_key"]
with open(f"{OUT}/car_names.csv","w",newline="",encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for m in final: w.writerow({c: ("" if m[c] is None else m[c]) for c in cols})
json.dump([{c: m[c] for c in cols} for m in final], open(f"{OUT}/car_names.json","w",encoding="utf-8"), ensure_ascii=False, indent=0)

# ---------- report ----------
bc = Counter(m["brand"] for m in final)
withyr = sum(1 for m in final if m["year_start"])
rep = []
rep.append("# car_names data report\n")
rep.append(f"- Rows read: Car_Models {len(d2)}, Cars_Datasets_2025 {len(d3)}")
rep.append(f"- **Final unique car names: {len(final)}** across **{len(bc)} brands**")
rep.append(f"- Rows with year data: {withyr} ({withyr*100//len(final)}%). Missing years come from Cars_Datasets_2025, which has no year column.")
rep.append(f"- Rows linked to a 3D model: {sum(m['has_3d_model'] for m in final)}")
rep.append(f"- body_style: empty for all rows (neither file has it). Fill from EPA/NHTSA later.\n")
rep.append("## Cleaning actions\n")
for k, v in dropped.items(): rep.append(f"- {k}: {v}")
rep.append(f"- Brand/model mislabels fixed: {len(fixes)}")
for f_ in fixes: rep.append(f"  - {f_}")
rep.append("\n## 3D registry mapping\n")
for rid, nm, st in reg_report: rep.append(f"- `{rid}` -> {nm}: {st}")
rep.append("- `mercedes_low` (generic low-poly Mercedes): skipped on purpose, not a real model.\n")
rep.append("## 3D model vs row year conflicts\nThe 3D file is one specific generation; the row shows the dataset's year range. Use `model_3d_label` in the UI.\n")
for c in year_conflicts: rep.append(f"- {c}")
rep.append("")
rep.append("## Brands (names count)\n")
rep.append(", ".join(f"{b} ({n})" for b, n in sorted(bc.items(), key=lambda x: (-x[1], x[0]))))
open(f"{OUT}/data_report.md","w",encoding="utf-8").write("\n".join(rep))
print("\n".join(rep[:40]))
