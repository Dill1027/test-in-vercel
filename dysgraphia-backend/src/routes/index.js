const express = require("express");
const predictionRoutes = require("./predictionRoutes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
  });
});

router.use("/prediction", predictionRoutes);

module.exports = router;
