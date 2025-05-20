import axios, { AxiosError } from "axios";
import { validateEnv } from "../env-validator";

/**
 * Buys a token using the Sniperoo API
 * @param tokenAddress The token's mint address
 * @param inputAmount Amount of SOL to spend
 * @returns Boolean indicating if the purchase was successful
 */
export async function buyToken(
  mintAddress: string,
  solAmount: number,
  enableAutoSell: boolean,
  takeProfitPercent: number,
  stopLossPercent: number
): Promise<boolean> {
  try {
    const env = validateEnv();

    // Validate inputs
    if (!mintAddress || typeof mintAddress !== "string" || mintAddress.trim() === "") {
      return false;
    }

    if (solAmount <= 0) {
      return false;
    }

    if (!takeProfitPercent || !stopLossPercent) {
      enableAutoSell = false;
    }

    // Prepare request body
    const requestBody = {
      walletAddresses: [env.SNIPEROO_PUBKEY],
      tokenAddress: mintAddress,
      inputAmount: solAmount,
      autoSell: {
        enabled: enableAutoSell,
        strategy: {
          strategyName: "simple",
          profitPercentage: takeProfitPercent,
          stopLossPercentage: stopLossPercent,
        },
      },
    };

    // Make API request using axios
    const response = await axios.post("https://api.sniperoo.xyz/v1/buy", requestBody, {
      headers: {
        Authorization: `Bearer ${env.SNIPEROO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      return true;
    }

    console.error("Sniperoo API error:", response.data);
    return false;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(
        `Sniperoo API error (${axiosError.response?.status || "unknown"}):`,
        axiosError.response?.data || axiosError.message
      );
    } else {
      console.error("Unexpected error:", error);
    }
    return false;
  }
}
