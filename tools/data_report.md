# car_names data report

- Rows read: Car_Models 404, Cars_Datasets_2025 1218
- **Final unique car names: 1462** across **68 brands**
- Rows with year data: 377 (25%). Missing years come from Cars_Datasets_2025, which has no year column.
- Rows linked to a 3D model: 36
- body_style: empty for all rows (neither file has it). Fill from EPA/NHTSA later.

## Cleaning actions

- concept-only (D3): 1
- duplicate merged: 165
- Brand/model mislabels fixed: 12
  - Dodge | Ram 1500  ->  Ram | 1500
  - Dodge | Ram 2500  ->  Ram | 2500
  - Dodge | Ram 3500  ->  Ram | 3500
  - Volvo | Polestar 2  ->  Polestar | 2
  - BMW | Mclaren 720s  ->  McLaren | 720s
  - Nissan | Infiniti QX80  ->  Infiniti | QX80
  - Nissan | Infiniti Q60  ->  Infiniti | Q60
  - Nissan | Infiniti FX50  ->  Infiniti | FX50
  - Nissan | Infiniti QX55  ->  Infiniti | QX55
  - Nissan | Infiniti G37  ->  Infiniti | G37
  - Nissan | Infiniti M45  ->  Infiniti | M45
  - Nissan | Infiniti Q45  ->  Infiniti | Q45

## 3D registry mapping

- `aston_vantage` -> Aston Martin Vantage: matched existing
- `audi_r8` -> Audi R8: ADDED (not in datasets)
- `audi_rs7` -> Audi RS7 Sportback: matched existing
- `bmw_m4` -> BMW M4 Competition: matched existing
- `bmw_i8` -> BMW i8 Roadster: matched existing
- `bmw_m3` -> BMW M3: ADDED (not in datasets)
- `chevy_camaro` -> Chevrolet Camaro SS: matched existing
- `chevy_corvette` -> Chevrolet Corvette: matched existing
- `ferrari_488` -> Ferrari 488 GTB: matched existing
- `ferrari_f8` -> Ferrari F8 Tributo: matched existing
- `ford_dodge` -> Dodge Challenger: matched existing
- `ford_f150` -> Ford F-150 Raptor: matched existing
- `ford_mus` -> Ford Mustang: matched existing
- `honda_civic` -> Honda Civic Type R: matched existing
- `honda_nsx` -> Honda NSX: matched existing
- `hyundai_tucson` -> Hyundai Tucson: matched existing
- `hyundai_veloster` -> Hyundai Veloster: matched existing
- `hyundai_elantra` -> Hyundai Elantra N: ADDED (not in datasets)
- `hyundai_creta` -> Hyundai Creta: ADDED (not in datasets)
- `hyundai_sonata` -> Hyundai Sonata: matched existing
- `rx7` -> Mazda RX-7: matched existing
- `subaru` -> Subaru Impreza: matched existing
- `lambo_hur` -> Lamborghini Huracan: matched existing
- `lambo_ave` -> Lamborghini Aventador SVJ Roadster: matched existing
- `maserati` -> Maserati GranTurismo: matched existing
- `mclaren` -> McLaren 720S: matched existing
- `mercedes_amg` -> Mercedes-Benz AMG GT: ADDED (not in datasets)
- `nissan_370z` -> Nissan 370Z: matched existing
- `nissan_gtr` -> Nissan GT-R: matched existing
- `porsche_cay` -> Porsche Cayman S: ADDED (not in datasets)
- `porsche_pan` -> Porsche Panamera Turbo S: matched existing
- `porsche_tay` -> Porsche Taycan Turbo S: matched existing
- `tesla_cyber` -> Tesla Cybertruck: matched existing
- `toyota_land` -> Toyota Land Cruiser: matched existing
- `toyota_supra` -> Toyota GR Supra: matched existing
- `vw_golf` -> Volkswagen Golf: matched existing
- `mercedes_low` (generic low-poly Mercedes): skipped on purpose, not a real model.

## 3D model vs row year conflicts
The 3D file is one specific generation; the row shows the dataset's year range. Use `model_3d_label` in the UI.

- Ford Mustang: row says 2015-2021 but 3D model is 1968 Mustang GT
- Honda NSX: row says 2016-present but 3D model is 1990 Honda NSX
- Hyundai Tucson: row says 2016-2022 but 3D model is 2015 Tucson
- Hyundai Sonata: row says 2018-2022 but 3D model is 2009 Sonata
- McLaren 720S: row says 2018-2020 but 3D model is 2017 McLaren 720s

## Brands (names count)

Nissan (150), Volkswagen (107), Porsche (92), Mazda (87), Kia (77), Mitsubishi (61), Chevrolet (59), GMC (59), Ford (54), Peugeot (53), BMW (49), Toyota (48), Jaguar (40), Lamborghini (32), Rolls-Royce (30), Tata (29), Acura (27), Mercedes-Benz (27), Audi (24), Hyundai (24), Cadillac (20), Jeep (19), Volvo (17), Ferrari (15), Bugatti (13), Honda (12), Infiniti (12), Koenigsegg (12), Aston Martin (11), Suzuki (11), Opel/Vauxhall (10), Tesla (10), Lexus (9), MINI (8), Subaru (8), Dodge (7), Mahindra (7), SEAT (7), Skoda (7), Vauxhall (7), Isuzu (6), Land Rover (6), McLaren (6), Renault (6), Zagato (6), Alpina (5), Caterham (5), Citroën (5), Genesis (5), Lancia (5), Morgan (5), Pagani (5), Alfa Romeo (4), Chrysler (4), Lotus (4), Maserati (4), Ram (4), Saab (4), Fiat (3), Maruti Suzuki (3), Polestar (3), Wiesmann (3), Fisker (2), Lucid (2), Rivian (2), Smart (2), Bentley (1), Faraday Future (1)