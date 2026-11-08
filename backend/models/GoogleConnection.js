const mongoose = require("mongoose");

const googleConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    provider: {
      type: String,
      default: "google_health",
      enum: ["google_health"],
    },

    accessToken: {
      type: String,
      required: true,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    tokenExpiry: {
      type: Date,
      default: null,
    },

    scopes: {
      type: [String],
      default: [],
    },

    healthUserId: {
      type: String,
      default: null,
    },

    // active: tokens usable. revoked: user removed access on Google side
    // or refresh failed, user must connect again.
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
    },

    lastSyncedAt: {
      type: Date,
      default: null,
    },

    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "GoogleConnection",
  googleConnectionSchema
);
