const mongoose = require("mongoose");

const planetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    sign: {
      type: String,
      default: "",
      trim: true,
    },

    degree: {
      type: Number,
      default: null,
    },

    house: {
      type: Number,
      default: null,
    },

    retrograde: {
      type: Boolean,
      default: false,
    },

    nakshatra: {
      type: String,
      default: "",
      trim: true,
    },

    nakshatraPada: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    latitude: {
      type: Number,
      default: null,
    },

    combust: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const houseSchema = new mongoose.Schema(
  {
    houseNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    sign: {
      type: String,
      default: "",
      trim: true,
    },

    degree: {
      type: Number,
      default: null,
    },

    lord: {
      type: String,
      default: "",
      trim: true,
    },

    planets: {
      type: [String],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const dashaSchema = new mongoose.Schema(
  {
    currentMahadasha: {
      type: String,
      default: "",
    },

    currentAntardasha: {
      type: String,
      default: "",
    },

    startDate: {
      type: String,
      default: "",
    },

    endDate: {
      type: String,
      default: "",
    },

    balance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    periods: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const doshaSchema = new mongoose.Schema(
  {
    manglik: {
      type: Boolean,
      default: false,
    },

    kaalSarp: {
      type: Boolean,
      default: false,
    },

    pitru: {
      type: Boolean,
      default: false,
    },

    nadi: {
      type: String,
      default: "",
    },

    details: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const kundliSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    birthProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BirthProfile",
      required: true,
      index: true,
    },

    lagna: {
      sign: {
        type: String,
        default: "",
      },

      degree: {
        type: Number,
        default: null,
      },

      nakshatra: {
        type: String,
        default: "",
      },

      pada: {
        type: Number,
        default: null,
      },
    },

    ascendant: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    moonSign: {
      type: String,
      default: "",
    },

    sunSign: {
      type: String,
      default: "",
    },

    nakshatra: {
      name: {
        type: String,
        default: "",
      },

      pada: {
        type: Number,
        default: null,
      },

      lord: {
        type: String,
        default: "",
      },
    },

    planets: {
      type: [planetSchema],
      default: [],
    },

    houses: {
      type: [houseSchema],
      default: [],
    },

    dasha: {
      type: dashaSchema,
      default: () => ({}),
    },

    doshas: {
      type: doshaSchema,
      default: () => ({}),
    },

    navamsha: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    yogas: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    charts: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    calculations: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    provider: {
      type: String,
      default: "navamsha",
    },

    providerStatusCode: {
      type: Number,
      default: null,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    lastRegeneratedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

kundliSchema.index({
  user: 1,
  birthProfile: 1,
  createdAt: -1,
});

kundliSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "Kundli",
  kundliSchema
);