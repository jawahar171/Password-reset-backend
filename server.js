require("dotenv").config();

// ── Validate required env vars on startup ──────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ Missing required environment variables:", missing.join(", "));
  process.exit(1);
}

const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = [
  "https://glittery-belekoy-b10d64.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn("🚫 CORS blocked origin:", origin);
    callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// ── Body parsing ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ──────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

app.use("/api/auth/login",           authLimiter);
app.use("/api/auth/register",        authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

// ── Request logger ─────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

// ── Health ─────────────────────────────────────────────────────
app.get("/", (_req, res) =>
  res.json({ message: "Password Reset Backend is running ✅" })
);

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    env: {
      JWT_SECRET:    !!process.env.JWT_SECRET,
      MONGO_URI:     !!process.env.MONGO_URI,
      EMAIL_SERVICE: process.env.EMAIL_SERVICE || "not set",
      EMAIL_USER:    !!process.env.EMAIL_USER,
      CLIENT_URL:    process.env.CLIENT_URL || "not set",
    },
  })
);

// ── DEBUG endpoint — open in browser to diagnose ──────────────
// REMOVE THIS AFTER FIXING
app.get("/debug-register", async (_req, res) => {
  const results = [];
  const User = require("./models/User");
  const jwt  = require("jsonwebtoken");

  // 1. Check env vars
  results.push({
    step: "1. ENV VARS",
    JWT_SECRET:    process.env.JWT_SECRET   ? "✅ SET" : "❌ MISSING",
    MONGO_URI:     process.env.MONGO_URI    ? "✅ SET" : "❌ MISSING",
    EMAIL_SERVICE: process.env.EMAIL_SERVICE || "❌ NOT SET",
    EMAIL_USER:    process.env.EMAIL_USER   ? "✅ SET" : "❌ NOT SET",
  });

  // 2. Check DB connection
  results.push({
    step: "2. DB CONNECTION",
    state: mongoose.connection.readyState,
    meaning:
      mongoose.connection.readyState === 0 ? "❌ disconnected" :
      mongoose.connection.readyState === 1 ? "✅ connected" :
      mongoose.connection.readyState === 2 ? "⏳ connecting" :
      "❌ disconnecting",
  });

  // 3. Try creating a test user
  const testEmail = `debug_test_${Date.now()}@test.com`;
  try {
    const user = await User.create({
      username: "debugtest",
      email:    testEmail,
      password: "Test1234",
    });
    results.push({ step: "3. USER CREATE", status: "✅ SUCCESS", userId: user._id });

    // 4. Try signing JWT
    try {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
      results.push({ step: "4. JWT SIGN", status: "✅ SUCCESS", tokenLength: token.length });
    } catch (jwtErr) {
      results.push({ step: "4. JWT SIGN", status: "❌ FAILED", error: jwtErr.message });
    }

    // 5. Cleanup test user
    await User.deleteOne({ _id: user._id });
    results.push({ step: "5. CLEANUP", status: "✅ Test user deleted" });

  } catch (createErr) {
    results.push({
      step:    "3. USER CREATE",
      status:  "❌ FAILED",
      error:   createErr.message,
      name:    createErr.name,
      code:    createErr.code,
    });
  }

  // 6. Check if jawaharsha02@gmail.com already exists
  try {
    const existing = await User.findOne({ email: "jawaharsha02@gmail.com" });
    results.push({
      step:   "6. CHECK YOUR EMAIL",
      email:  "jawaharsha02@gmail.com",
      exists: existing ? "⚠️  ALREADY REGISTERED — this causes 409, not 500" : "✅ not in DB",
    });
  } catch (e) {
    results.push({ step: "6. CHECK YOUR EMAIL", error: e.message });
  }

  res.json({ debug: true, results });
});

// ── Routes ─────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// ── 404 ────────────────────────────────────────────────────────
app.use((req, res) => {
  console.warn(`⚠️  404 — ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── Global error handler ───────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("💥 Global error:", err.message);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

// ── Connect DB then start server ───────────────────────────────
const connectDB = require("./config/db");
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});