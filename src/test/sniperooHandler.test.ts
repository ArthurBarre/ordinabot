import { buyToken } from "../utils/handlers/sniperooHandler";

/**
 * Simple test function for the buyToken functionality
 */
const tokenAddress = ""; // Replace with a real token address for testing
const amount = 0.01; // Small amount for testing
const sell = false; // Don't auto-sell in tests
const takeProfit = 50; // 50% take profit
const stopLoss = 15; // 15% stop loss

async function testBuyToken(): Promise<void> {
  console.log("=== Testing Sniperoo buyToken Function ===");

  // Test case 1: Valid parameters
  try {
    console.log("\nTest 1: Valid parameters");
    console.log("Buying token with valid parameters...");
    console.log(`Token Address: ${tokenAddress}`);
    console.log(`Amount: ${amount} SOL`);
    const result = await buyToken(tokenAddress, amount, sell, takeProfit, stopLoss);
    console.log(`Result: ${result ? "SUCCESS ✅" : "FAILED ❌"}`);
  } catch (error) {
    console.error("Test 1 Error:", error instanceof Error ? error.message : "Unknown error");
  }

  // Test case 2: Invalid token address
  try {
    console.log("\nTest 2: Invalid token address");
    console.log("Buying token with empty address...");
    const result = await buyToken("", amount, sell, takeProfit, stopLoss);
    console.log(`Result: ${result ? "SUCCESS ✅" : "FAILED ❌"}`);
  } catch (error) {
    console.log(`Error caught as expected: ${error instanceof Error ? error.message : "Unknown error"} ✅`);
  }

  // Test case 3: Invalid amount
  try {
    console.log("\nTest 3: Invalid amount");
    console.log("Buying token with zero amount...");
    const result = await buyToken(tokenAddress, 0, sell, takeProfit, stopLoss);
    console.log(`Result: ${result ? "SUCCESS ✅" : "FAILED ❌"}`);
  } catch (error) {
    console.log(`Error caught as expected: ${error instanceof Error ? error.message : "Unknown error"} ✅`);
  }
  console.log("\n=== Test Complete ===");
}

// Run the test
testBuyToken().catch((error) => {
  console.error("Unhandled error in test:", error);
});
