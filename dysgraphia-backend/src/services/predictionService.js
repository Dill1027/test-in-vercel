const axios = require("axios");
const env = require("../config/env");
const labelMap = require("../utils/labelMap");
const FormData = require("form-data");

const normalizeCandidates = (candidates) => {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => ({
      label: String(item.label || ""),
      confidence: Number(item.confidence || 0),
    }))
    .sort((a, b) => b.confidence - a.confidence);
};

const mockPredict = () => {
  const mockResult = {
    label: "අ",
    confidence: 0.92,
    candidates: [
      { label: "අ", confidence: 0.92 },
      { label: "ආ", confidence: 0.05 },
      { label: "ඇ", confidence: 0.03 },
    ],
  };

  return mockResult;
};


const pythonPredict = async (imageBuffer) => {
  if (!env.pythonModelUrl) {
    const error = new Error(
      "PYTHON_MODEL_URL is required when ML_PROVIDER is python"
    );

    error.statusCode = 500;
    throw error;
  }

  const formData = new FormData();

  formData.append("file", imageBuffer, {
    filename: "handwriting.jpg",
    contentType: "image/jpeg",
  });

  try {
    const { data } = await axios.post(
      env.pythonModelUrl,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return {
      label: String(data.label || ""),
      confidence: Number(data.confidence || 0),
      candidates: normalizeCandidates(data.candidates),
    };

  } catch (error) {
    console.error(
      "Python model error:",
      error.response?.data || error.message
    );

    const modelError = new Error(
      "Failed to get prediction from Python model"
    );

    modelError.statusCode = 502;

    throw modelError;
  }
};

const mapNumericLabelIfNeeded = (label) => {
  if (/^\d+$/.test(label) && labelMap[label]) {
    return labelMap[label];
  }

  return label;
};

const predictSinhalaLetter = async (imageBuffer) => {
  let result;

  if (env.mlProvider === "python") {
    result = await pythonPredict(imageBuffer);
  } else {
    result = mockPredict();
  }

  const mappedLabel = mapNumericLabelIfNeeded(result.label);
  const confidence = Number(result.confidence || 0);

  return {
    predictedLetter: mappedLabel,
    confidence,
    isAccepted: confidence >= env.confidenceThreshold,
    candidates: result.candidates,
  };
};

module.exports = {
  predictSinhalaLetter,
};
