const axios = require("axios");
const FormData = require("form-data");
const http = require("http");
const env = require("../../config/env");
const labelMap = require("../../utils/labelMap");
const { AppError } = require("../../utils/appError");

const predictorClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 4 }),
  timeout: 30000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});


function mapNumericLabelIfNeeded(label) {
  const value = String(label || "");

  if (labelMap[value] != null) {
    return labelMap[value];
  }

  return value;
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => ({
      label: String(item.label || ""),
      confidence: Number(item.confidence || 0),
    }))
    .sort((left, right) => right.confidence - left.confidence);
}

function createMockPrediction() {
  return {
    predicted: "",
    confidence: 0,
    rawPrediction: {
      provider: "mock",
      message: "TODO: connect a real handwriting predictor service.",
    },
    candidates: [],
  };
}

async function pythonPredictSingleCharacter(imageBuffer) {
  const predictorUrl = env.predictorUrl || env.pythonModelUrl || "";

  if (!predictorUrl) {
    throw new AppError(
      422,
      "PREDICTION_FAILED",
      "Unable to evaluate handwriting for this image."
    );
  }

  const form = new FormData();

  form.append("file", imageBuffer, {
    filename: "letter.png",
    contentType: "image/png",
  });

  try {
    const { data } = await predictorClient.post(
        predictorUrl,
        form,
        {
          headers: form.getHeaders(),
        }
      );

    if (!data?.success || !data?.label) {
      return {
        predicted: "",
        confidence: 0,
        predictions: [],
        rawPrediction: data,
        candidates: [],
      };
    }

    // Python already gives us the Sinhala character.
    const predicted = mapNumericLabelIfNeeded(
      data.sinhala || data.label
    );

    const confidence = Number(data.confidence || 0);

    const predictions = Array.isArray(data.candidates)
      ? data.candidates.map((item) => ({
          predicted: mapNumericLabelIfNeeded(
            item.sinhala || item.label
          ),
          confidence: Number(item.confidence || 0),
        }))
      : [];

    return {
      predicted,
      confidence,
      predictions,
      rawPrediction: data,
      candidates: normalizeCandidates(data.candidates),
    };

  } catch (error) {

    throw new AppError(
      422,
      "PREDICTION_FAILED",
      "Unable to evaluate handwriting for this image.",
      {
        cause: error,
      }
    );
  }
}

function createPredictor({ logger }) {
  async function predictSingleCharacter(imageBuffer) {
    try {
      const provider = env.predictorProvider || env.mlProvider || "mock";
      if (provider === "python") {
        return await pythonPredictSingleCharacter(imageBuffer);
      }

      return createMockPrediction();
    } catch (error) {
      if (logger) {
        logger.error({ error: error.message }, "Character prediction failed");
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(422, "PREDICTION_FAILED", "Unable to evaluate handwriting for this image.", {
        cause: error,
      });
    }
  }

  async function predictWord(imageBuffer, expectedLength) {
    const prediction = await predictSingleCharacter(imageBuffer);
    const predictedLetters = prediction.predicted ? Array.from(prediction.predicted) : [];

    return {
      predictedLetters,
      predictedWord: prediction.predicted,
      confidences: predictedLetters.length ? [prediction.confidence] : [],
      segmentation: {
        bounds: null,
        ranges: [],
        totalInk: 0,
      },
      rawPrediction: prediction.rawPrediction,
      failureReason: null,
    };
  }

  return {
    predictSingleCharacter,
    predictWord,
  };
}

module.exports = {
  createPredictor,
};
