const predictionService = require("../services/predictionService");

const predictLetter = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      const error = new Error("Image file is required in field 'image'");
      error.statusCode = 400;
      throw error;
    }

    const result = await predictionService.predictSinhalaLetter(req.file.buffer);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  predictLetter,
};
