/**
 * Seeds the e-store: puja-material categories, welcome coupons and (optionally) demo products.
 *
 *   npm run seed:store                 -> categories + coupons (safe to run many times)
 *   npm run seed:store -- --demo       -> also adds demo products for the first APPROVED merchant
 */
require("dotenv").config();
const connectDB = require("../config/db");
const Category = require("../models/Category");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const { slugify, uniqueSlug } = require("../services/storeService");

const CATEGORIES = [
  ["Havan Samagri", "Havan kund, samidha, havan mix and hawan essentials"],
  ["Pooja Thali & Essentials", "Thali sets, kalash plates, aarti thali, bell"],
  ["Incense, Dhoop & Agarbatti", "Agarbatti, dhoop, cones, sambrani, loban"],
  ["Diyas, Lamps & Batti", "Clay diyas, brass lamps, cotton wicks, akhand jyot"],
  ["Ghee, Oil & Kapoor", "Pure cow ghee, til oil, camphor and pooja oils"],
  ["Roli, Kumkum, Chandan & Haldi", "Tilak and pooja colours"],
  ["Kalash & Pooja Vessels", "Copper / brass kalash, lota, panchpatra, achmani"],
  ["Idols & Murtis", "Ganesh, Lakshmi, Shiv, Hanuman and more"],
  ["Rudraksha & Malas", "Rudraksha beads, japa malas, tulsi malas"],
  ["Gemstones & Yantras", "Certified gemstones, rings, yantras"],
  ["Mauli, Janeu, Asan & Vastra", "Sacred threads, kusha asan, pooja cloth, dhoti"],
  ["Festival Pooja Kits", "Diwali, Navratri, Ganesh Chaturthi, Janmashtami, Karwa Chauth"],
  ["Ritual Pooja Kits", "Satyanarayan, Griha Pravesh, Rudrabhishek, Vivah and more"],
  ["Gangajal & Holy Water", "Gangajal, Panchamrit ingredients"],
  ["Prasad & Dry Fruits", "Prasad items, mishri, makhana, dry fruits"],
  ["Pooja Books & Aarti Sangrah", "Chalisa, katha books, aarti sangrah"],
  ["Mandir & Pooja Room Decor", "Home temples, bell, torans, rangoli, flowers (artificial)"],
];

const COUPONS = [
  { code: "WELCOME10", description: "10% off on your first order (up to ₹150)", type: "percent", value: 10, maxDiscount: 150, minOrderAmount: 299, firstOrderOnly: true, perUserLimit: 1 },
  { code: "PUJA50", description: "Flat ₹50 off on orders above ₹599", type: "flat", value: 50, minOrderAmount: 599, perUserLimit: 0 },
];

const DEMO = [
  { name: "Havan Samagri (500 g)", cat: "Havan Samagri", price: 149, mrp: 199, stock: 100, unit: "pack", gst: 5, tags: ["havan", "hawan", "samagri"] },
  { name: "Pure Cow Ghee for Pooja (500 ml)", cat: "Ghee, Oil & Kapoor", price: 399, mrp: 460, stock: 60, unit: "bottle", gst: 12, tags: ["ghee", "diya"] },
  { name: "Camphor / Kapoor Tablets (100 g)", cat: "Ghee, Oil & Kapoor", price: 89, mrp: 120, stock: 150, unit: "pack", gst: 12, tags: ["kapoor", "aarti"] },
  { name: "Sandalwood Agarbatti (Pack of 6)", cat: "Incense, Dhoop & Agarbatti", price: 129, mrp: 180, stock: 200, unit: "pack", gst: 5, tags: ["agarbatti", "chandan"] },
  { name: "Roli Kumkum Chandan Set", cat: "Roli, Kumkum, Chandan & Haldi", price: 79, mrp: 110, stock: 120, unit: "set", gst: 5, tags: ["roli", "tilak"] },
  { name: "Clay Diyas (Set of 12)", cat: "Diyas, Lamps & Batti", price: 99, mrp: 140, stock: 150, unit: "set", gst: 5, tags: ["diya", "diwali"] },
  { name: "Cotton Batti / Wicks (Pack of 100)", cat: "Diyas, Lamps & Batti", price: 49, mrp: 70, stock: 300, unit: "pack", gst: 5, tags: ["batti", "wicks"] },
  { name: "Brass Pooja Thali Set (7 pcs)", cat: "Pooja Thali & Essentials", price: 899, mrp: 1299, stock: 25, unit: "set", gst: 12, tags: ["thali", "aarti"], returnable: true },
  { name: "Copper Kalash with Lid", cat: "Kalash & Pooja Vessels", price: 349, mrp: 499, stock: 40, unit: "piece", gst: 12, tags: ["kalash", "copper"], returnable: true },
  { name: "Panch Mukhi Rudraksha Mala (108 beads)", cat: "Rudraksha & Malas", price: 499, mrp: 799, stock: 35, unit: "piece", gst: 3, tags: ["rudraksha", "mala"], returnable: true },
  { name: "Ganesh Murti - Brass (4 inch)", cat: "Idols & Murtis", price: 749, mrp: 999, stock: 20, unit: "piece", gst: 12, tags: ["ganesh", "murti"], returnable: true },
  { name: "Gangajal (250 ml)", cat: "Gangajal & Holy Water", price: 59, mrp: 80, stock: 200, unit: "bottle", gst: 5, tags: ["gangajal"] },
  { name: "Mauli / Kalawa Sacred Thread", cat: "Mauli, Janeu, Asan & Vastra", price: 29, mrp: 40, stock: 300, unit: "piece", gst: 5, tags: ["mauli", "kalawa"] },
  {
    name: "Satyanarayan Katha Pooja Kit", cat: "Ritual Pooja Kits", price: 649, mrp: 850, stock: 50, unit: "kit", gst: 5, isKit: true, tags: ["satyanarayan", "katha", "kit"],
    kit: [["Roli, Kumkum, Chandan", "1 set"], ["Haldi", "50 g"], ["Mauli", "1 pc"], ["Supari, Paan leaf", "5 each"], ["Agarbatti", "1 pack"], ["Kapoor", "20 g"], ["Cotton batti", "20 pcs"], ["Kalash", "1 pc"], ["Panchamrit ingredients", "1 set"], ["Katha book", "1 pc"]],
  },
  {
    name: "Griha Pravesh Pooja Kit", cat: "Ritual Pooja Kits", price: 1299, mrp: 1699, stock: 30, unit: "kit", gst: 5, isKit: true, tags: ["griha pravesh", "kit"],
    kit: [["Havan samagri", "500 g"], ["Havan samidha", "1 pack"], ["Ghee", "250 ml"], ["Kalash with coconut", "1 set"], ["Roli, Akshat, Mauli", "1 set"], ["Agarbatti, Dhoop", "1 each"], ["Diyas", "6 pcs"], ["Toran", "1 pc"]],
  },
  {
    name: "Diwali Lakshmi-Ganesh Pooja Kit", cat: "Festival Pooja Kits", price: 799, mrp: 1099, stock: 45, unit: "kit", gst: 5, isKit: true, tags: ["diwali", "lakshmi", "kit"],
    kit: [["Lakshmi-Ganesh photo / murti", "1 set"], ["Roli, Chawal, Kumkum", "1 set"], ["Diyas", "12 pcs"], ["Batti", "1 pack"], ["Kapoor", "1 pack"], ["Agarbatti", "1 pack"], ["Kalash", "1 pc"], ["Batasha / Mishri", "250 g"]],
  },
];

(async () => {
  await connectDB();

  let created = 0;
  for (const [i, [name, description]] of CATEGORIES.entries()) {
    const slug = slugify(name);
    const r = await Category.updateOne({ slug }, { $setOnInsert: { name, slug, description, sortOrder: i + 1, isActive: true } }, { upsert: true });
    if (r.upsertedCount) created += 1;
  }
  console.log(`Categories: ${created} created, ${CATEGORIES.length - created} already present`);

  let couponsCreated = 0;
  for (const c of COUPONS) {
    const r = await Coupon.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });
    if (r.upsertedCount) couponsCreated += 1;
  }
  console.log(`Coupons: ${couponsCreated} created`);

  if (process.argv.includes("--demo")) {
    const vendor = await Vendor.findOne({ role: "merchant", status: "approved" });
    if (!vendor) {
      console.log("No approved merchant found - skipped demo products. Approve a merchant first.");
    } else {
      const cats = new Map((await Category.find()).map((c) => [c.name, c]));
      let added = 0;
      for (const d of DEMO) {
        if (await Product.exists({ vendor: vendor._id, name: d.name })) continue;
        const cat = cats.get(d.cat);
        await Product.create({
          vendor: vendor._id,
          name: d.name,
          slug: uniqueSlug(d.name),
          description: `${d.name}. Quality puja material for your daily and festival rituals.`,
          price: d.price,
          mrp: d.mrp,
          gstPercent: d.gst,
          stock: d.stock,
          unit: d.unit,
          category: d.cat,
          categoryRef: cat?._id || null,
          tags: d.tags,
          isKit: !!d.isKit,
          kitItems: (d.kit || []).map(([name, quantity]) => ({ name, quantity })),
          isReturnable: !!d.returnable,
          isFeatured: !!d.isKit,
          moderation: "approved",
        });
        added += 1;
      }
      console.log(`Demo products added for "${vendor.name}": ${added}`);
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
