// ═══════════════════════════════════════════════
//  server.js  —  Application Entry Point
//  Starts Express, connects MongoDB, mounts routes
// ═══════════════════════════════════════════════
const express = require("express");
const dotenv   = require("dotenv");
const cors     = require("cors");
const connectDB = require("./config/db");

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// ── Middleware ────────────────────────────────
// Parse incoming JSON request bodies
app.use(express.json());

// Enable CORS so the React frontend (port 3000) can talk to this server (port 5000)
// Without this the browser blocks cross-origin requests
app.use(
  cors({
    origin: process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app/",
    credentials: true,
  })
);

// ── Routes ───────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/user", require("./routes/userRoutes"));

// ── Health check ─────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Password Reset API is running ✅" });
});

// ── 404 handler ──────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ─────────────────────
// Catches any unhandled errors and returns a clean JSON response
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

// ── Start Server ─────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 CORS enabled for: ${process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app/"}`);
});