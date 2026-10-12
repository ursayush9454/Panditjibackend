
const {
  matchKundli,
} = require("../services/kundliMatchingService");

const createKundliMatch = async (req, res) => {
  try {
    const { bride, groom } = req.body;

    if (!bride || !groom) {
      return res.status(400).json({
        success: false,
        message: "Bride and groom birth details are required",
      });
    }

    const result = await matchKundli(bride, groom);

    return res.status(200).json({
      success: true,
      message: "Kundli matching completed successfully",
      data: result,
    });
  } catch (error) {
    console.error(
      "[Kundli Matching] Error:",
      error.response?.data || error.message
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to match kundlis",
    });
  }
};

module.exports = { createKundliMatch };
