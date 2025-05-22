export interface LiquidityPool {
  enabled: boolean;
  id: string;
  name: string;
  program: string;
  instruction: string;
}

export interface TokenAuthorityStatus {
  isSecure: boolean;
  hasMintAuthority: boolean;
  hasFreezeAuthority: boolean;
}

export interface WebSocketConfig {
  url: string;
  initialBackoff: number;
  maxBackoff: number;
  maxRetries: number;
  debug: boolean;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export type CheckMode = 'snipe' | 'full' | 'none';
export type TradingProvider = 'sniperoo';

export interface TokenBuyConfig {
  provider: TradingProvider;
  solAmount: number;
  playSound: boolean;
  playSoundText?: string;
}

export interface TokenSellConfig {
  enabled: boolean;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export interface CheckSettings {
  allowMintAuthority: boolean;
  allowFreezeAuthority: boolean;
  maxAllowedPctTopholders: number;
  excludeLpFromTopholders: boolean;
  blockReturningTokenNames: boolean;
  blockReturningTokenCreators: boolean;
  allowInsiderTopholders: boolean;
  allowNotInitialized: boolean;
  allowRugged: boolean;
  allowMutable: boolean;
  blockSymbols: string[];
  blockNames: string[];
  minTotalLpProviders: number;
  minTotalMarkets: number;
  minTotalMarketLiquidity: number;
  ignoreEndsWithPump: boolean;
  maxScore: number;
}

export type StrategyType = 'buyLastNode' | 'baseTrading' | 'followWallet' | 'sniffer' | 'copytrading' | 'traceFunds' | 'backtraceFunds' | 'buyAllSold';

export interface Strategy {
  name: string;
  description: string;
  type: StrategyType;
  run: () => Promise<void>;
}

export interface StrategyConfig {
  type: StrategyType;
  // Add any strategy-specific config here
} 