export const WSOL_PC_MINT = 'So11111111111111111111111111111111111111112';

export const DEFAULT_WS_CONFIG = {
  initialBackoff: 1000,
  maxBackoff: 30000,
  maxRetries: Infinity,
  debug: true,
};

export const DEFAULT_CONCURRENT_TRANSACTIONS = 1;

export const DEFAULT_TOKEN_BUY = {
  provider: 'sniperoo' as const,
  solAmount: 0.05,
  playSound: true,
  playSoundText: 'Order Filled!',
};

export const DEFAULT_TOKEN_SELL = {
  enabled: true,
  stopLossPercent: 15,
  takeProfitPercent: 50,
};

export const DEFAULT_CHECK_SETTINGS = {
  allowMintAuthority: false,
  allowFreezeAuthority: false,
  maxAllowedPctTopholders: 50,
  excludeLpFromTopholders: true,
  blockReturningTokenNames: true,
  blockReturningTokenCreators: true,
  allowInsiderTopholders: false,
  allowNotInitialized: false,
  allowRugged: false,
  allowMutable: false,
  blockSymbols: ['XXX'],
  blockNames: ['XXX'],
  minTotalLpProviders: 999,
  minTotalMarkets: 999,
  minTotalMarketLiquidity: 5000,
  ignoreEndsWithPump: true,
  maxScore: 1,
}; 