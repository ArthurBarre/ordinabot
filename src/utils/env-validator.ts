import dotenv from "dotenv";
// Load environment variables
dotenv.config();

export interface EnvConfig {
  HELIUS_API_KEY: string;
  HELIUS_HTTPS_URI: string;
  HELIUS_WSS_URI: string;
  SNIPEROO_API_KEY: string;
  SNIPEROO_PUBKEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export function validateEnv(): EnvConfig {
  const requiredVars = [
    'HELIUS_API_KEY',
    'HELIUS_HTTPS_URI',
    'SNIPEROO_API_KEY',
    'SNIPEROO_PUBKEY'
  ];

  // Additional required vars when in bot mode
  if (process.env.MODE === 'bot') {
    requiredVars.push('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID');
  }

  const missingVars = requiredVars.filter(
    varName => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  const validateUrl = (envVar: string, protocol: string, checkApiKey: boolean = false) => {
    const value = process.env[envVar];
    if (!value) return;

    const url = new URL(value);
    if (value && url.protocol !== protocol) {
      throw new Error(`🚫 ${envVar} must start with ${protocol}`);
    }
    if (checkApiKey && value) {
      const apiKey = url.searchParams.get("api-key");
      if (!apiKey || apiKey.trim() === "") {
        throw new Error(`🚫 The 'api-key' parameter is missing or empty in the URL: ${value}`);
      }
    }
  };

  validateUrl("HELIUS_HTTPS_URI", "https:", true);
  validateUrl("HELIUS_WSS_URI", "wss:", true);

  return {
    HELIUS_API_KEY: process.env.HELIUS_API_KEY!,
    HELIUS_HTTPS_URI: process.env.HELIUS_HTTPS_URI!,
    HELIUS_WSS_URI: process.env.HELIUS_WSS_URI!,
    SNIPEROO_API_KEY: process.env.SNIPEROO_API_KEY!,
    SNIPEROO_PUBKEY: process.env.SNIPEROO_PUBKEY!,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
  };
}
