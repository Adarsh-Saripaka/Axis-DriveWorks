export function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeSpecKey(brand, model) {
  return `${slugify(brand)}-${slugify(model)}`;
}

export const BRAND_ALIAS = {
  mercedes: "mercedes-benz",
  vw: "volkswagen"
};

export function resolveBrandSlug(b) {
  const s = slugify(b);
  return BRAND_ALIAS[s] || s;
}

export async function resolveCarBySlugs(db, brandInput, modelInput) {
  if (!db || !brandInput || !modelInput) return null;
  const bSlug = resolveBrandSlug(brandInput);
  const mSlug = slugify(modelInput);

  return await db.get(
    "SELECT * FROM car_names WHERE brand_slug = ? AND model_slug = ?",
    [bSlug, mSlug]
  );
}

