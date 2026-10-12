require("./src/server").start().catch((error) => {
  console.error("Dysgraphia backend failed to start:", error.message);
  process.exitCode = 1;
});
