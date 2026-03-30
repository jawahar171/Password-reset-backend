// ═══════════════════════════════════════════════
//  models/User.js  —  Mongoose User Schema
//
//  Password Reset fields added to standard User:
//    resetToken        — SHA-256 hash of the random string emailed to user
//    resetTokenExpire  — expiry timestamp (10 minutes from generation)
// ═══════════════════════════════════════════════
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");

const UserSchema = new mongoose.Schema(
  {
    // ── Core Fields ──────────────────────────
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Excluded from query results by default (security)
    },

    // ── Password Reset Fields ─────────────────
    // We store only the HASH of the token, never the raw token.
    // This means even if the database is compromised, the tokens are useless.
    resetToken: {
      type: String,
      default: undefined,
    },
    resetTokenExpire: {
      type: Date,
      default: undefined,
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

// ── Pre-save Hook: Hash password ──────────────
// Runs automatically before every .save()
// Only re-hashes if the password field was actually changed
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance Method: Compare passwords ────────
// Compares a plain-text password against the stored bcrypt hash
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Instance Method: Generate Reset Token ─────
//
// HOW IT WORKS:
//   Step 1 → Generate 32 random bytes and convert to hex string (raw token)
//            This is what gets emailed to the user inside a link
//   Step 2 → SHA-256 hash the raw token and store the hash in DB
//            If someone steals the DB, they can't use the hash to reset passwords
//   Step 3 → Set expiry to RESET_TOKEN_EXPIRE_MINUTES from now (default 10 min)
//   Step 4 → Return the RAW token (to be included in the email link)
//
UserSchema.methods.generateResetToken = function () {
  // Step 1: raw random token (sent to user via email)
  const rawToken = crypto.randomBytes(32).toString("hex");

  // Step 2: hash and store in DB
  this.resetToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  // Step 3: set expiry
  const expireMinutes = parseInt(process.env.RESET_TOKEN_EXPIRE_MINUTES) || 10;
  this.resetTokenExpire = Date.now() + expireMinutes * 60 * 1000;

  // Step 4: return the raw token for the email
  return rawToken;
};

module.exports = mongoose.model("User", UserSchema);