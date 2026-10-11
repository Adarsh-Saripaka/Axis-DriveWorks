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
