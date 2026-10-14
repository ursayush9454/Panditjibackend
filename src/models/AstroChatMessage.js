const mongoose = require("mongoose");

const { Schema } = mongoose;

const astroChatMessageSchema = new Schema(
  {
    session: { type: Schema.Types.ObjectId, ref: "AstroChatSession", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

astroChatMessageSchema.index({ session: 1, createdAt: 1 });

module.exports =
  mongoose.models.AstroChatMessage ||
  mongoose.model("AstroChatMessage", astroChatMessageSchema);
