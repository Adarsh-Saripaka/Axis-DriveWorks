import { z } from "zod";

/**
 * Normalizes Unicode to NFC, strips control characters, and trims.
 */
export const cleanText = (max = 500, min = 1) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min).max(max));

/**
 * Schema for Test Drive Booking creation.
 * Strict mode prevents mass assignment or smuggled fields.
 */
export const ReservationSchema = z
  .object({
    car_brand: cleanText(100, 1),
    car_model: cleanText(100, 1),
    date: z
      .string()
      .transform((val) => {
        const trimmed = val.trim();
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed)) {
          const parts = trimmed.split(/[/-]/);
          return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
        }
        return trimmed;
      })
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must follow YYYY-MM-DD format")),
    name: cleanText(100, 2).optional(),
    spec_key: z.string().max(200).optional()
  })
  .strict();

/**
 * Schema for vehicle data correction / reports.
 * Field-aware validation with strict mode.
 */
export const ReportSchema = z
  .object({
    spec_key: cleanText(200, 1),
    field: z
      .enum([
        "general",
        "horsepower",
        "torque",
        "topSpeed",
        "zeroToSixty",
        "weight",
        "range",
        "engine",
        "transmission"
      ])
      .default("general"),
    proposed_value: cleanText(100, 1).optional(),
    message: cleanText(500, 5)
  })
  .strict();

/**
 * Reusable Express request body validation middleware.
 * Returns 400 Bad Request with field paths and messages upon validation failure.
 */
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: "Invalid input",
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message
      }))
    });
  }
  req.body = result.data;
  next();
};
