#!/usr/bin/env node

/**
 * CORS Configuration Test Script
 * Tests that CORS headers are properly configured for frontend requests from localhost:5173
 */

const http = require("http");

const BASE_URL = "http://localhost:5000";

function makeRequest(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);

    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    console.log(`\n📡 ${method} ${path}`);
    console.log(`Headers sent:`, reqOptions.headers);

    const req = http.request(reqOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          allHeaders: JSON.stringify(res.headers),
          body: data,
        });
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function runTests() {
  console.log("🧪 CORS Configuration Test Suite");
  console.log("=".repeat(60));
  console.log(`Testing backend at: ${BASE_URL}`);
  console.log(`Frontend origin: http://localhost:5173`);
  console.log("=".repeat(60));

  try {
    // Test 1: Preflight OPTIONS request
    console.log("\n✅ TEST 1: Preflight OPTIONS Request");
    console.log("-".repeat(60));
    const optionsResult = await makeRequest("OPTIONS", "/api/dysgraphia/overview", {
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });

    console.log(`Status: ${optionsResult.status}`);
    console.log("Response Headers:");
    console.log(`  Access-Control-Allow-Origin: ${optionsResult.headers["access-control-allow-origin"]}`);
    console.log(`  Access-Control-Allow-Methods: ${optionsResult.headers["access-control-allow-methods"]}`);
    console.log(`  Access-Control-Allow-Headers: ${optionsResult.headers["access-control-allow-headers"]}`);
    console.log(`  Access-Control-Allow-Credentials: ${optionsResult.headers["access-control-allow-credentials"]}`);

    const test1Pass =
      optionsResult.status === 200 &&
      optionsResult.headers["access-control-allow-origin"] === "http://localhost:5173" &&
      optionsResult.headers["access-control-allow-credentials"] === "true";

    console.log(`\nResult: ${test1Pass ? "✅ PASS" : "❌ FAIL"}`);

    // Test 2: GET request with Origin header
    console.log("\n✅ TEST 2: GET Request with Origin Header");
    console.log("-".repeat(60));
    const getResult = await makeRequest("GET", "/health", {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    console.log(`Status: ${getResult.status}`);
    console.log("Response Headers:");
    console.log(`  Access-Control-Allow-Origin: ${getResult.headers["access-control-allow-origin"]}`);
    console.log(`  Access-Control-Allow-Credentials: ${getResult.headers["access-control-allow-credentials"]}`);
    console.log(`Body: ${getResult.body}`);

    const test2Pass =
      getResult.status === 200 && getResult.headers["access-control-allow-origin"] === "http://localhost:5173";

    console.log(`\nResult: ${test2Pass ? "✅ PASS" : "❌ FAIL"}`);

    // Test 3: Verify wrong origin is rejected
    console.log("\n✅ TEST 3: Wrong Origin Should Be Rejected");
    console.log("-".repeat(60));
    const wrongOriginResult = await makeRequest("GET", "/health", {
      headers: {
        Origin: "http://malicious-site.com",
      },
    });

    console.log(`Status: ${wrongOriginResult.status}`);
    console.log("Response Headers:");
    console.log(`  Access-Control-Allow-Origin: ${wrongOriginResult.headers["access-control-allow-origin"] || "(not set)"}`);
    console.log(`Body: ${wrongOriginResult.body}`);

    const test3Pass =
      wrongOriginResult.status === 200 &&
      !wrongOriginResult.headers["access-control-allow-origin"];

    console.log(`\nResult: ${test3Pass ? "✅ PASS - Origin correctly rejected" : "❌ FAIL"}`);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`Test 1 (Preflight OPTIONS): ${test1Pass ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Test 2 (GET with Origin): ${test2Pass ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Test 3 (Wrong Origin): ${test3Pass ? "✅ PASS" : "❌ FAIL"}`);

    const allPass = test1Pass && test2Pass && test3Pass;
    console.log(
      `\nOverall: ${allPass ? "✅ ALL TESTS PASSED" : "⚠️  SOME TESTS FAILED"}`
    );

    if (!allPass) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Test Error:", error.message);
    process.exit(1);
  }
}

runTests();
