/**
 * ChargeEV — Presentation Generator
 * -----------------------------------------------------------------------
 * Generates a 17-slide, 16:9 pptxgenjs presentation for ChargeEV, an
 * AI-powered EV charging platform (React + Express + Prisma/MongoDB).
 *
 * Style: hybrid "soft glass" — the strict cream/brown/gold/sage palette
 * and Impact/Poppins typography rules are followed exactly, but cards are
 * rendered as semi-transparent frosted panels (soft fill + faint top
 * highlight + soft shadow) instead of flat opaque boxes, so the deck reads
 * as light glassmorphism without breaking the color/typography spec.
 *
 * Run:
 *   npm install pptxgenjs
 *   node scripts/generate-pptx.js
 *
 * Output: ChargeEV_Presentation.pptx (repo root)
 */

const pptxgen = require("pptxgenjs");

// ---------------------------------------------------------------------
// Project data (pulled from CODEBASE_SUMMARY.md / README.md — replace
// the placeholders below with real names before presenting)
// ---------------------------------------------------------------------
const PROJECT = {
  title: "ChargeEV",
  tagline: "AI-Powered EV Charging Station Management Platform",
  presentedBy: "Your Name Here",
  institute: "Your Institute Name",
  supervisor: "Supervisor Name",
  team: [
    { name: "Your Name Here", role: "Full-Stack Development" },
    { name: "Team Member 2", role: "Backend & Database" },
    { name: "Team Member 3", role: "UI/UX & Frontend" },
    { name: "Team Member 4", role: "Testing & Deployment" },
  ],
  problem:
    "EV drivers struggle to find available charging slots in real time, while high-demand slots create unresolved conflicts between drivers — and station owners lack a unified way to manage slots, pricing, and revenue.",
  solution:
    "ChargeEV connects drivers, station owners, and admins on one platform: live slot booking, a fair bid-based auction for contested slots, and AI-driven station recommendations ranked by distance, price, availability, and battery urgency.",
  techStack: {
    Frontend: ["React 18", "Vite", "Redux Toolkit", "Bootstrap 5", "Socket.IO Client"],
    Backend: ["Node.js", "Express.js", "Prisma ORM", "Socket.IO", "JWT + bcrypt"],
    Database: ["MongoDB Atlas", "10 Prisma Models", "6 Enums"],
    "Tools & Services": ["Stripe Payments", "Nodemailer SMTP", "Jest + Supertest", "Vercel + Railway"],
  },
  modules: [
    {
      name: "EV & Booking Management",
      desc: "Drivers register EVs, browse approved stations on a live map, and book charging slots with race-safe, concurrency-tested availability checks.",
      points: [
        "EV CRUD with real-time battery % tracking",
        "Station & slot discovery via react-leaflet map",
        "Race-condition-safe booking (verified under Promise.all load)",
        "Booking lifecycle: create, check-in, complete, cancel",
      ],
    },
    {
      name: "Real-Time Auction System",
      desc: "Contested high-demand slots go to a live bidding auction instead of first-come-first-served, so urgency and fairness both matter.",
      points: [
        "Priority score = 60% normalized bid + 40% battery urgency",
        "Live bid leaderboard pushed via Socket.IO (bid:update)",
        "Persistent toast + chime on auction:won",
        "Fixed reference ceiling keeps ranking order-independent",
      ],
    },
    {
      name: "AI-Powered Recommendations",
      desc: "A weighted scoring engine ranks nearby stations instead of just sorting by distance, factoring in real charging urgency.",
      points: [
        "Distance 30% · Price/kWh 25% · Availability 25% · Urgency 20%",
        "Battery ≤20% → emergency, 3x urgency multiplier",
        "Route-aware recommendation endpoint",
        "Ranked results returned in real time",
      ],
    },
    {
      name: "Admin Dashboard & Security",
      desc: "A dedicated admin surface for platform oversight, backed by hardened auth, validation, and audit logging.",
      points: [
        "Approve/reject stations, manage users, resolve complaints",
        "Full audit log (Log model) for every admin action",
        "JWT auth + bcrypt(12) + role-based access control",
        "Rate limiting, input validation, XSS-hardened email templates",
      ],
    },
  ],
  differentiators: [
    "Fair auction system — bids weighted with real battery urgency, not just highest bidder",
    "AI recommendation engine — 4-factor weighted scoring, not simple distance sort",
    "Real-time everywhere — Socket.IO for bids, auctions, bookings, station status",
    "Production-grade hardening — race-safe bookings, idempotent Stripe webhooks, magic-byte file validation",
  ],
  future: [
    "Native mobile app (React Native) for drivers and owners",
    "Dynamic, demand-based slot pricing",
    "Route-based fast-charging trip planner",
    "Subscription tiers for fleet operators + public API for agritech-style partner integrations",
  ],
  validation: [
    { k: "126 / 126", v: "automated tests passing" },
    { k: "9", v: "test suites (Jest + Supertest)" },
    { k: "62", v: "API endpoints across 13 route files" },
    { k: "0", v: "backend vulnerabilities" },
  ],
};

// ---------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------
const COLORS = {
  bg: "FDF8F0", // cream / off-white
  brown: "8B5A2B", // primary accent
  gold: "D4AF37", // secondary accent
  sage: "A3B18A", // tertiary accent
  charcoal: "2C2C2C", // text
  card: "F5F0E8", // card background
  cardBorder: "D2B48C", // card border
  white: "FFFFFF",
};

const FONT_HEAD = "Impact";
const FONT_BODY = "Poppins";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Cream background + faint 10%-opacity decorative corner shapes. */
function addBackground(slide, variant = "default") {
  slide.background = { color: COLORS.bg };

  slide.addShape("ellipse", {
    x: SLIDE_W - 2.6,
    y: -1.8,
    w: 4.2,
    h: 4.2,
    fill: { color: COLORS.sage, transparency: 90 },
    line: { type: "none" },
  });
  slide.addShape("ellipse", {
    x: -1.8,
    y: SLIDE_H - 2.2,
    w: 3.6,
    h: 3.6,
    fill: { color: COLORS.gold, transparency: 92 },
    line: { type: "none" },
  });
  slide.addShape("line", {
    x: 0,
    y: SLIDE_H - 0.45,
    w: SLIDE_W,
    h: 0,
    line: { color: COLORS.cardBorder, width: 0.75, transparency: 40 },
  });

  // Faint "leaf" silhouettes (teardrop shapes, ~10% opacity) in opposite
  // corners — a quiet nod to the EV/eco theme, subtle enough not to
  // compete with content.
  slide.addShape("teardrop", {
    x: 0.35,
    y: 0.3,
    w: 0.9,
    h: 0.9,
    rotate: 130,
    fill: { color: COLORS.sage, transparency: 90 },
    line: { color: COLORS.sage, width: 0.5, transparency: 85 },
  });
  slide.addShape("teardrop", {
    x: SLIDE_W - 1.2,
    y: SLIDE_H - 1.1,
    w: 0.85,
    h: 0.85,
    rotate: -50,
    fill: { color: COLORS.gold, transparency: 90 },
    line: { color: COLORS.gold, width: 0.5, transparency: 85 },
  });

  // Small gold accent dot at the end of the footer rule.
  slide.addShape("ellipse", {
    x: SLIDE_W - 0.55,
    y: SLIDE_H - 0.475,
    w: 0.06,
    h: 0.06,
    fill: { color: COLORS.gold, transparency: 25 },
    line: { type: "none" },
  });

  if (variant === "cover") {
    slide.addShape("ellipse", {
      x: SLIDE_W / 2 - 3.2,
      y: SLIDE_H / 2 - 3.2,
      w: 6.4,
      h: 6.4,
      fill: { color: COLORS.gold, transparency: 94 },
      line: { color: COLORS.gold, width: 0.75, transparency: 75 },
    });
    slide.addShape("teardrop", {
      x: SLIDE_W / 2 - 4.6,
      y: SLIDE_H / 2 - 1.1,
      w: 1.3,
      h: 1.3,
      rotate: 200,
      fill: { color: COLORS.sage, transparency: 88 },
      line: { type: "none" },
    });
    slide.addShape("teardrop", {
      x: SLIDE_W / 2 + 3.3,
      y: SLIDE_H / 2 - 0.2,
      w: 1.3,
      h: 1.3,
      rotate: 20,
      fill: { color: COLORS.sage, transparency: 88 },
      line: { type: "none" },
    });
  }
}

/** Thin elegant accent line, used under headings. */
function addUnderline(slide, x, y, w, color = COLORS.gold) {
  slide.addShape("line", {
    x,
    y,
    w,
    h: 0,
    line: { color, width: 2.25 },
  });
}

/**
 * Frosted "glass" card: semi-transparent fill, soft floating shadow,
 * an inset edge-glow ring (simulates light catching the glass rim), and
 * a top highlight band (simulates a soft light source above).
 */
function glassCard(slide, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 0.14;

  // Soft, wide, low-opacity shadow — reads as "floating" rather than "cut out".
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: radius,
    fill: { color: opts.fill ?? COLORS.card, transparency: opts.transparency ?? 30 },
    line: { color: opts.border ?? COLORS.cardBorder, width: opts.borderWidth ?? 1 },
    shadow: {
      type: "outer",
      color: COLORS.brown,
      opacity: 0.13,
      blur: 14,
      offset: 2,
      angle: 90,
    },
  });

  // Inset edge-glow ring, just inside the border, to fake glass refraction.
  if (opts.glow !== false) {
    slide.addShape("roundRect", {
      x: x + 0.045,
      y: y + 0.045,
      w: w - 0.09,
      h: h - 0.09,
      rectRadius: Math.max(radius - 0.02, 0),
      fill: { type: "none" },
      line: { color: COLORS.white, width: 0.75, transparency: 55 },
    });
  }

  // Top highlight band — soft light source above the panel.
  if (opts.highlight !== false) {
    slide.addShape("roundRect", {
      x: x + 0.08,
      y: y + 0.08,
      w: w - 0.16,
      h: Math.min(h * 0.32, 0.75),
      rectRadius: Math.max(radius * 0.65, 0),
      fill: { color: COLORS.white, transparency: 84 },
      line: { type: "none" },
    });
  }
}

function addHeading(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.6,
    y: opts.y ?? 0.45,
    w: opts.w ?? SLIDE_W - 1.2,
    h: opts.h ?? 1,
    fontFace: FONT_HEAD,
    fontSize: opts.size ?? 44,
    color: opts.color ?? COLORS.brown,
    align: opts.align ?? "left",
    lineSpacingMultiple: 1.2,
  });
  if (opts.underline !== false) {
    addUnderline(slide, opts.x ?? 0.6, (opts.y ?? 0.45) + (opts.underlineY ?? 0.95), opts.underlineW ?? 1.6);
  }
}

function addSubheading(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.6,
    y: opts.y ?? 1.5,
    w: opts.w ?? SLIDE_W - 1.2,
    h: opts.h ?? 0.5,
    fontFace: FONT_BODY,
    fontSize: opts.size ?? 26,
    bold: true,
    color: opts.color ?? COLORS.charcoal,
    align: opts.align ?? "left",
    lineSpacingMultiple: 1.3,
  });
}

function addBody(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.6,
    y: opts.y ?? 2,
    w: opts.w ?? SLIDE_W - 1.2,
    h: opts.h ?? 1,
    fontFace: FONT_BODY,
    fontSize: opts.size ?? 17,
    bold: false,
    color: opts.color ?? COLORS.charcoal,
    align: opts.align ?? "left",
    lineSpacingMultiple: 1.35,
    valign: opts.valign ?? "top",
  });
}

function addBullets(slide, items, opts = {}) {
  slide.addText(
    items.map((t) => ({
      text: t,
      options: { bullet: { code: "25CF", indent: 18 }, breakLine: true },
    })),
    {
      x: opts.x ?? 0.6,
      y: opts.y ?? 2,
      w: opts.w ?? SLIDE_W - 1.2,
      h: opts.h ?? 3,
      fontFace: FONT_BODY,
      fontSize: opts.size ?? 16,
      color: opts.color ?? COLORS.charcoal,
      lineSpacingMultiple: 1.4,
      paraSpaceAfter: 8,
      valign: "top",
    }
  );
}

function addLabel(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.6,
    y: opts.y ?? 0.6,
    w: opts.w ?? 3,
    h: opts.h ?? 0.3,
    fontFace: FONT_BODY,
    fontSize: opts.size ?? 13,
    color: opts.color ?? COLORS.brown,
    bold: opts.bold ?? true,
    align: opts.align ?? "left",
    charSpacing: 1,
  });
}

function addFooter(slide, pageNum, totalSlides) {
  slide.addText(PROJECT.title.toUpperCase(), {
    x: 0.5,
    y: SLIDE_H - 0.42,
    w: 4,
    h: 0.3,
    fontFace: FONT_BODY,
    fontSize: 10,
    color: COLORS.brown,
    charSpacing: 1.5,
  });
  slide.addText(`${pageNum} / ${totalSlides}`, {
    x: SLIDE_W - 1.4,
    y: SLIDE_H - 0.42,
    w: 0.9,
    h: 0.3,
    fontFace: FONT_BODY,
    fontSize: 10,
    color: COLORS.brown,
    align: "right",
  });
}

// ---------------------------------------------------------------------
// Build presentation
// ---------------------------------------------------------------------
const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: SLIDE_W, height: SLIDE_H });
pptx.layout = "WIDE";
pptx.author = PROJECT.presentedBy;
pptx.title = PROJECT.title;

const TOTAL_SLIDES = 17;
let n = 0;
const next = () => ++n;

// ---- 1. Title / Cover -------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide, "cover");

  glassCard(slide, 1.9, 2.15, SLIDE_W - 3.8, 3.3, { transparency: 45, radius: 0.2 });

  slide.addText(PROJECT.title, {
    x: 1.9,
    y: 2.55,
    w: SLIDE_W - 3.8,
    h: 1.3,
    fontFace: FONT_HEAD,
    fontSize: 54,
    color: COLORS.brown,
    align: "center",
    lineSpacingMultiple: 1.1,
  });
  addUnderline(slide, SLIDE_W / 2 - 1, 3.85, 2, COLORS.gold);
  slide.addText(PROJECT.tagline, {
    x: 2.4,
    y: 4.05,
    w: SLIDE_W - 4.8,
    h: 0.8,
    fontFace: FONT_BODY,
    fontSize: 20,
    bold: true,
    color: COLORS.charcoal,
    align: "center",
    lineSpacingMultiple: 1.3,
  });
  slide.addText(`Presented by ${PROJECT.presentedBy}  |  ${PROJECT.institute}`, {
    x: 2.4,
    y: 4.85,
    w: SLIDE_W - 4.8,
    h: 0.5,
    fontFace: FONT_BODY,
    fontSize: 14,
    color: COLORS.charcoal,
    align: "center",
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 2. The Team -------------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "The Team", { size: 46 });
  addSubheading(slide, "Presented By", { y: 1.55 });

  const cols = PROJECT.team.length;
  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap * (cols - 1)) / cols;
  const cardY = 2.4;
  const cardH = 3.4;

  PROJECT.team.forEach((member, i) => {
    const x = 0.6 + i * (cardW + gap);
    glassCard(slide, x, cardY, cardW, cardH, { transparency: 32 });

    slide.addShape("ellipse", {
      x: x + cardW / 2 - 0.55,
      y: cardY + 0.4,
      w: 1.1,
      h: 1.1,
      fill: { color: COLORS.sage, transparency: 55 },
      line: { color: COLORS.brown, width: 1.25 },
    });
    slide.addText(member.name.charAt(0), {
      x: x + cardW / 2 - 0.55,
      y: cardY + 0.4,
      w: 1.1,
      h: 1.1,
      fontFace: FONT_HEAD,
      fontSize: 30,
      color: COLORS.brown,
      align: "center",
      valign: "middle",
    });
    slide.addText(member.name, {
      x: x + 0.15,
      y: cardY + 1.75,
      w: cardW - 0.3,
      h: 0.6,
      fontFace: FONT_BODY,
      fontSize: 16,
      bold: true,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.25,
    });
    slide.addText(member.role, {
      x: x + 0.15,
      y: cardY + 2.4,
      w: cardW - 0.3,
      h: 0.7,
      fontFace: FONT_BODY,
      fontSize: 13,
      color: COLORS.brown,
      align: "center",
      lineSpacingMultiple: 1.3,
    });
  });

  slide.addText(`Supervisor: ${PROJECT.supervisor}`, {
    x: 0.6,
    y: 6.15,
    w: SLIDE_W - 1.2,
    h: 0.4,
    fontFace: FONT_BODY,
    fontSize: 14,
    bold: true,
    color: COLORS.brown,
    align: "center",
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 3. Agenda -----------------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Agenda", { size: 46 });

  const agendaItems = [
    "Problem Statement",
    "Our Solution",
    "Who Uses It",
    "Core Technology Stack",
    "System Architecture",
    "Database Design",
    "Module 01 — EV & Booking Management",
    "Module 02 — Real-Time Auction System",
    "Module 03 — AI-Powered Recommendations",
    "Module 04 — Admin Dashboard & Security",
    "Validation & Testing",
    "Unique Differentiators",
    "Future Scope & Business Model",
  ];

  const colCount = 2;
  const rows = Math.ceil(agendaItems.length / colCount);
  const colW = (SLIDE_W - 1.2 - 0.4) / colCount;
  const rowH = 0.62;

  agendaItems.forEach((item, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = 0.6 + col * (colW + 0.4);
    const y = 1.65 + row * rowH;

    slide.addShape("roundRect", {
      x,
      y: y + 0.06,
      w: 0.42,
      h: 0.42,
      rectRadius: 0.08,
      fill: { color: COLORS.gold, transparency: 55 },
      line: { color: COLORS.brown, width: 0.75 },
    });
    slide.addText(String(i + 1).padStart(2, "0"), {
      x,
      y: y + 0.06,
      w: 0.42,
      h: 0.42,
      fontFace: FONT_BODY,
      fontSize: 13,
      bold: true,
      color: COLORS.brown,
      align: "center",
      valign: "middle",
    });
    slide.addText(item, {
      x: x + 0.55,
      y,
      w: colW - 0.55,
      h: 0.54,
      fontFace: FONT_BODY,
      fontSize: 16,
      color: COLORS.charcoal,
      valign: "middle",
      lineSpacingMultiple: 1.2,
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 4. Problem Statement -------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Problem Statement", { size: 44 });

  glassCard(slide, 0.6, 2.1, SLIDE_W - 1.2, 2, { transparency: 30 });
  addBody(slide, PROJECT.problem, {
    x: 1.0,
    y: 2.4,
    w: SLIDE_W - 2,
    h: 1.5,
    size: 19,
    valign: "middle",
  });

  const stats = [
    { k: "30%+", v: "of charging time wasted searching for available slots" },
    { k: "0", v: "fair mechanism for resolving contested high-demand slots" },
    { k: "Manual", v: "revenue & slot tracking for station owners" },
  ];
  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap * 2) / 3;
  stats.forEach((s, i) => {
    const x = 0.6 + i * (cardW + gap);
    glassCard(slide, x, 4.5, cardW, 2, { transparency: 35 });
    slide.addText(s.k, {
      x,
      y: 4.65,
      w: cardW,
      h: 0.8,
      fontFace: FONT_HEAD,
      fontSize: 30,
      color: COLORS.gold,
      align: "center",
    });
    slide.addText(s.v, {
      x: x + 0.2,
      y: 5.45,
      w: cardW - 0.4,
      h: 0.9,
      fontFace: FONT_BODY,
      fontSize: 13,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.3,
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 5. Our Solution -------------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Our Solution", { size: 44 });

  glassCard(slide, 0.6, 2.1, SLIDE_W - 1.2, 1.9, { transparency: 30 });
  addBody(slide, PROJECT.solution, {
    x: 1.0,
    y: 2.35,
    w: SLIDE_W - 2,
    h: 1.5,
    size: 18,
    valign: "middle",
  });

  const pillars = [
    { t: "Book", d: "Find & reserve charging slots in real time" },
    { t: "Bid", d: "Fair live auctions for contested high-demand slots" },
    { t: "Recommend", d: "AI-ranked stations by distance, price & urgency" },
  ];
  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap * 2) / 3;
  pillars.forEach((p, i) => {
    const x = 0.6 + i * (cardW + gap);
    glassCard(slide, x, 4.3, cardW, 2.2, { transparency: 32 });
    slide.addText(p.t, {
      x,
      y: 4.5,
      w: cardW,
      h: 0.55,
      fontFace: FONT_BODY,
      fontSize: 22,
      bold: true,
      color: COLORS.brown,
      align: "center",
    });
    slide.addText(p.d, {
      x: x + 0.25,
      y: 5.15,
      w: cardW - 0.5,
      h: 1.2,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.35,
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 6. Who Uses It --------------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Who Uses It", { size: 44 });
  addSubheading(slide, "Target Users & Roles", { y: 1.5 });

  const personas = [
    {
      role: "EV Driver",
      desc: "Registers EVs, discovers stations on a live map, books slots, bids in auctions, pays via Stripe, reviews stations.",
    },
    {
      role: "Station Owner",
      desc: "Creates & manages stations and slots (pending admin approval), tracks revenue reports, closes auctions.",
    },
    {
      role: "Admin",
      desc: "Approves/rejects stations, manages users, resolves complaints, monitors the full audit log & dashboard.",
    },
  ];
  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap * 2) / 3;
  personas.forEach((p, i) => {
    const x = 0.6 + i * (cardW + gap);
    glassCard(slide, x, 2.3, cardW, 4.1, { transparency: 30 });
    slide.addShape("roundRect", {
      x: x + cardW / 2 - 0.4,
      y: 2.55,
      w: 0.8,
      h: 0.8,
      rectRadius: 0.4,
      fill: { color: COLORS.sage, transparency: 55 },
      line: { color: COLORS.brown, width: 1 },
    });
    slide.addText(p.role, {
      x,
      y: 3.55,
      w: cardW,
      h: 0.55,
      fontFace: FONT_BODY,
      fontSize: 20,
      bold: true,
      color: COLORS.brown,
      align: "center",
    });
    slide.addText(p.desc, {
      x: x + 0.3,
      y: 4.2,
      w: cardW - 0.6,
      h: 2.1,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.4,
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 7. Core Technology Stack ----------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Core Technology Stack", { size: 40 });

  const entries = Object.entries(PROJECT.techStack);
  const gapX = 0.35;
  const gapY = 0.35;
  const cardW = (SLIDE_W - 1.2 - gapX) / 2;
  const cardH = 2.15;

  entries.forEach(([category, items], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * (cardW + gapX);
    const y = 1.65 + row * (cardH + gapY);

    glassCard(slide, x, y, cardW, cardH, { transparency: 32 });
    slide.addText(category, {
      x: x + 0.25,
      y: y + 0.18,
      w: cardW - 0.5,
      h: 0.4,
      fontFace: FONT_BODY,
      fontSize: 17,
      bold: true,
      color: COLORS.brown,
    });
    addUnderline(slide, x + 0.25, y + 0.58, 1.1, COLORS.sage);
    slide.addText(items.join("   ·   "), {
      x: x + 0.25,
      y: y + 0.72,
      w: cardW - 0.5,
      h: cardH - 0.9,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.charcoal,
      lineSpacingMultiple: 1.4,
      valign: "top",
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 8. System Architecture -------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "System Architecture", { size: 40 });

  const blocks = [
    { t: "React Frontend", s: "Vite + Redux Toolkit\n(port 3000)" },
    { t: "Express API", s: "REST + Socket.IO\n(port 5000)" },
    { t: "Prisma ORM", s: "Schema & queries" },
    { t: "MongoDB Atlas", s: "10 models, 6 enums" },
  ];
  const bw = 2.5;
  const bh = 1.3;
  const gap = (SLIDE_W - 1.2 - bw * 4) / 3;
  const by = 2.3;

  blocks.forEach((b, i) => {
    const x = 0.6 + i * (bw + gap);
    glassCard(slide, x, by, bw, bh, { transparency: 28 });
    slide.addText(b.t, {
      x,
      y: by + 0.15,
      w: bw,
      h: 0.4,
      fontFace: FONT_BODY,
      fontSize: 15,
      bold: true,
      color: COLORS.brown,
      align: "center",
    });
    slide.addText(b.s, {
      x: x + 0.1,
      y: by + 0.55,
      w: bw - 0.2,
      h: 0.65,
      fontFace: FONT_BODY,
      fontSize: 11,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.25,
    });
    if (i < blocks.length - 1) {
      slide.addShape("line", {
        x: x + bw,
        y: by + bh / 2,
        w: gap,
        h: 0,
        line: { color: COLORS.gold, width: 2, endArrowType: "triangle" },
      });
    }
  });

  glassCard(slide, 0.6, 4.15, SLIDE_W - 1.2, 1, { transparency: 35 });
  slide.addText(
    "Real-time layer: Socket.IO pushes bid updates, auction results, and booking/payment status directly to connected clients — bypassing the request/response cycle above for live events.",
    {
      x: 0.95,
      y: 4.35,
      w: SLIDE_W - 1.9,
      h: 0.6,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.charcoal,
      align: "center",
      valign: "middle",
      lineSpacingMultiple: 1.3,
    }
  );

  const flowRow = [
    "Express API  →  SMTP (Nodemailer)  →  User Emails",
    "Express API  →  AI Scoring Engine  →  Ranked Stations",
  ];
  flowRow.forEach((t, i) => {
    slide.addText(t, {
      x: 0.6,
      y: 5.5 + i * 0.55,
      w: SLIDE_W - 1.2,
      h: 0.45,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.brown,
      align: "center",
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 9. Database Design -----------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Database Design", { size: 40 });
  addSubheading(slide, "10 Prisma Models on MongoDB Atlas", { y: 1.5 });

  const models = [
    "User", "EV", "ChargingStation", "Slot", "Booking",
    "Review", "Bid", "Payment", "Log", "Complaint",
  ];
  const cols = 5;
  const gap = 0.25;
  const cardW = (SLIDE_W - 1.2 - gap * (cols - 1)) / cols;
  const cardH = 0.85;

  models.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.6 + col * (cardW + gap);
    const y = 2.25 + row * (cardH + gap);
    glassCard(slide, x, y, cardW, cardH, { transparency: 30, radius: 0.1 });
    slide.addText(m, {
      x,
      y,
      w: cardW,
      h: cardH,
      fontFace: FONT_BODY,
      fontSize: 14,
      bold: true,
      color: COLORS.brown,
      align: "center",
      valign: "middle",
    });
  });

  glassCard(slide, 0.6, 4.35, SLIDE_W - 1.2, 2.3, { transparency: 32 });
  addBullets(
    slide,
    [
      "User (driver) owns EVs and makes Bookings against a Slot belonging to a ChargingStation owned by another User (owner)",
      "Contested slots go to auction via Bid — completed Bookings unlock Reviews",
      "Payment records tie each transaction to Stripe; Log powers the full admin audit trail",
      "Enums: Role, StationStatus, SlotStatus, BookingStatus, BidStatus, PaymentStatus",
    ],
    { x: 0.95, y: 4.55, w: SLIDE_W - 1.9, h: 2, size: 14 }
  );

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 10-13. Modules ------------------------------------------------------
PROJECT.modules.forEach((mod, idx) => {
  const slide = pptx.addSlide();
  addBackground(slide);
  addLabel(slide, `MODULE 0${idx + 1}`, { y: 0.5 });
  addHeading(slide, mod.name, { y: 0.85, size: 38, underlineY: 0.85 });

  glassCard(slide, 0.6, 2.0, SLIDE_W - 1.2, 1.15, { transparency: 30 });
  addBody(slide, mod.desc, {
    x: 0.95,
    y: 2.18,
    w: SLIDE_W - 1.9,
    h: 0.85,
    size: 16,
    valign: "middle",
  });

  glassCard(slide, 0.6, 3.4, SLIDE_W - 1.2, 3.1, { transparency: 32 });
  addSubheading(slide, "Highlights", { x: 0.95, y: 3.6, size: 18 });
  addBullets(slide, mod.points, { x: 0.95, y: 4.15, w: SLIDE_W - 1.9, h: 2.2, size: 15 });

  addFooter(slide, next(), TOTAL_SLIDES);
});

// ---- 14. Validation & Testing ------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Validation & Testing", { size: 40 });

  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap * 3) / 4;
  PROJECT.validation.forEach((s, i) => {
    const x = 0.6 + i * (cardW + gap);
    glassCard(slide, x, 1.8, cardW, 1.7, { transparency: 30 });
    slide.addText(s.k, {
      x,
      y: 1.95,
      w: cardW,
      h: 0.7,
      fontFace: FONT_HEAD,
      fontSize: 28,
      color: COLORS.gold,
      align: "center",
    });
    slide.addText(s.v, {
      x: x + 0.15,
      y: 2.65,
      w: cardW - 0.3,
      h: 0.75,
      fontFace: FONT_BODY,
      fontSize: 12,
      color: COLORS.charcoal,
      align: "center",
      lineSpacingMultiple: 1.25,
    });
  });

  glassCard(slide, 0.6, 3.8, SLIDE_W - 1.2, 2.9, { transparency: 32 });
  addSubheading(slide, "What Was Verified", { x: 0.95, y: 4.0, size: 18 });
  addBullets(
    slide,
    [
      "Genuine concurrent-request race-condition test for booking (Promise.all, not sequential calls)",
      "Stripe webhook idempotency — a replayed webhook charges exactly once",
      "Stored-XSS fix verified across all 12 transactional email templates",
      "WCAG contrast math + Modal ARIA rebuild + 58 form-label accessibility fixes",
      "ESLint clean on both sides · 313/313 imports resolve case-exactly",
    ],
    { x: 0.95, y: 4.55, w: SLIDE_W - 1.9, h: 2, size: 14 }
  );

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 15. Unique Differentiators ----------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Unique Differentiators", { size: 40 });

  const gap = 0.35;
  const cardW = (SLIDE_W - 1.2 - gap) / 2;
  const cardH = 2.1;
  PROJECT.differentiators.forEach((d, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * (cardW + gap);
    const y = 1.75 + row * (cardH + gap);
    glassCard(slide, x, y, cardW, cardH, { transparency: 30 });
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.25,
      y: y + 0.2,
      w: 1,
      h: 0.6,
      fontFace: FONT_HEAD,
      fontSize: 26,
      color: COLORS.gold,
    });
    slide.addText(d, {
      x: x + 0.25,
      y: y + 0.85,
      w: cardW - 0.5,
      h: cardH - 1.05,
      fontFace: FONT_BODY,
      fontSize: 15,
      color: COLORS.charcoal,
      lineSpacingMultiple: 1.35,
      valign: "top",
    });
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 16. Future Scope / Business Model ----------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addHeading(slide, "Future Scope & Business Model", { size: 36 });

  glassCard(slide, 0.6, 1.9, SLIDE_W - 1.2, 4.6, { transparency: 30 });
  addSubheading(slide, "Where ChargeEV Goes Next", { x: 0.95, y: 2.15, size: 20 });
  addBullets(slide, PROJECT.future, {
    x: 0.95,
    y: 2.8,
    w: SLIDE_W - 1.9,
    h: 3.4,
    size: 17,
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---- 17. Thank You / Q&A --------------------------------------------------
{
  const slide = pptx.addSlide();
  addBackground(slide, "cover");

  glassCard(slide, 2.9, 2.5, SLIDE_W - 5.8, 2.6, { transparency: 42, radius: 0.2 });
  slide.addText("Thank You", {
    x: 2.9,
    y: 2.8,
    w: SLIDE_W - 5.8,
    h: 1,
    fontFace: FONT_HEAD,
    fontSize: 50,
    color: COLORS.brown,
    align: "center",
  });
  addUnderline(slide, SLIDE_W / 2 - 0.8, 3.85, 1.6, COLORS.gold);
  slide.addText("Questions & Answers", {
    x: 2.9,
    y: 4.05,
    w: SLIDE_W - 5.8,
    h: 0.6,
    fontFace: FONT_BODY,
    fontSize: 22,
    bold: true,
    color: COLORS.charcoal,
    align: "center",
  });

  slide.addText(
    PROJECT.team.map((m) => m.name).join("   ·   "),
    {
      x: 1.5,
      y: 5.4,
      w: SLIDE_W - 3,
      h: 0.5,
      fontFace: FONT_BODY,
      fontSize: 14,
      color: COLORS.brown,
      align: "center",
    }
  );
  slide.addText(PROJECT.institute, {
    x: 1.5,
    y: 5.85,
    w: SLIDE_W - 3,
    h: 0.4,
    fontFace: FONT_BODY,
    fontSize: 13,
    color: COLORS.charcoal,
    align: "center",
  });

  addFooter(slide, next(), TOTAL_SLIDES);
}

// ---------------------------------------------------------------------
pptx.writeFile({ fileName: "ChargeEV_Presentation.pptx" }).then(() => {
  console.log("Generated ChargeEV_Presentation.pptx");
});
