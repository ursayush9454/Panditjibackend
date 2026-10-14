/**
 * Validation / sanitising of product payloads (merchant + admin). Pure, no DB access.
 * @param body     raw request body
 * @param partial  true for updates (only provided fields are validated)
 * @returns { data, errors }
 */
const mongoose = require("mongoose");

const isUrl = (u) => typeof u === "string" && (/^\/uploads\/[\w.\-]+$/.test(u) || /^https?:\/\/\S+$/i.test(u));

const toList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split(",");
  return [];
};

const sanitizeProductInput = (body = {}, { partial = false } = {}) => {
  const data = {};
  const errors = [];
  const has = (k) => body[k] !== undefined;

  if (!partial || has("name")) {
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 150) errors.push("Product name must be 2-150 characters");
    else data.name = name;
  }

  if (has("description")) data.description = String(body.description || "").trim().slice(0, 3000);

  if (!partial || has("price")) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) errors.push("Valid price is required");
    else data.price = Math.round(price * 100) / 100;
  }

  if (has("mrp")) {
    const mrp = Number(body.mrp);
    if (!Number.isFinite(mrp) || mrp < 0) errors.push("MRP must be a positive number");
    else data.mrp = Math.round(mrp * 100) / 100;
  }

  if (has("gstPercent")) {
    const g = Number(body.gstPercent);
    if (!Number.isFinite(g) || g < 0 || g > 28) errors.push("GST percent must be between 0 and 28");
    else data.gstPercent = g;
  }

  if (has("stock")) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) errors.push("Stock must be a whole number (0 or more)");
    else data.stock = stock;
  }

  if (has("lowStockThreshold")) {
    const v = Number(body.lowStockThreshold);
    if (!Number.isInteger(v) || v < 0) errors.push("Low stock threshold must be a whole number");
    else data.lowStockThreshold = v;
  }

  if (has("maxPerOrder")) {
    const v = Number(body.maxPerOrder);
    if (!Number.isInteger(v) || v < 1 || v > 100) errors.push("maxPerOrder must be between 1 and 100");
    else data.maxPerOrder = v;
  }

  if (has("image")) {
    if (body.image && !isUrl(body.image)) errors.push("image must be an uploaded file path or http(s) URL");
    else data.image = body.image || "";
  }

  if (has("images")) {
    const imgs = toList(body.images).map((i) => String(i).trim()).filter(Boolean);
    if (imgs.length > 8) errors.push("A product can have at most 8 images");
    else if (imgs.some((i) => !isUrl(i))) errors.push("Every image must be an uploaded file path or http(s) URL");
    else data.images = imgs;
  }

  if (has("category")) data.category = String(body.category || "").trim().slice(0, 80);

  if (has("categoryId")) {
    if (body.categoryId === null || body.categoryId === "") data.categoryRef = null;
    else if (!mongoose.isValidObjectId(body.categoryId)) errors.push("Invalid categoryId");
    else data.categoryRef = body.categoryId;
  }

  ["sku", "brand", "unit"].forEach((k) => {
    if (has(k)) data[k] = String(body[k] || "").trim().slice(0, 60);
  });

  if (has("weightGrams")) {
    const w = Number(body.weightGrams);
    if (!Number.isFinite(w) || w < 0) errors.push("weightGrams must be a positive number");
    else data.weightGrams = w;
  }

  if (has("tags")) {
    data.tags = [...new Set(toList(body.tags).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 15);
  }

  if (has("isKit")) data.isKit = body.isKit === true || body.isKit === "true";

  if (has("kitItems")) {
    if (!Array.isArray(body.kitItems)) errors.push("kitItems must be a list");
    else {
      data.kitItems = body.kitItems
        .map((k) => ({ name: String(k?.name || "").trim(), quantity: String(k?.quantity ?? "1").trim() }))
        .filter((k) => k.name)
        .slice(0, 60);
    }
  }

  if (has("relatedPujas")) {
    const ids = toList(body.relatedPujas).map(String);
    if (ids.some((i) => !mongoose.isValidObjectId(i))) errors.push("relatedPujas contains an invalid id");
    else data.relatedPujas = ids;
  }

  if (has("isReturnable")) data.isReturnable = body.isReturnable === true || body.isReturnable === "true";
  if (has("isActive")) data.isActive = body.isActive === true || body.isActive === "true";

  if (data.mrp && data.price !== undefined && data.mrp < data.price) {
    errors.push("MRP cannot be lower than the selling price");
  }

  return { data, errors };
};

module.exports = { sanitizeProductInput, isUrl };
