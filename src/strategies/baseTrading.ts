import { Strategy, CheckMode } from '../core/types';
import { TokenTrackerApp } from '../core/app';
import { DEFAULT_WS_CONFIG } from '../core/constants';
import { config } from '../config';

export const baseTradingStrategy: Strategy = {
  name: 'Base Trading',
  description: 'Run configurable strategy-based trading bot via TokenTrackerApp',
  type: 'baseTrading',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY || '950a6725-e50f-4a59-b71d-7326a5800091';
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
    const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    const checkMode = config.checks.mode as CheckMode;
    if (!['snipe', 'full', 'none'].includes(checkMode)) {
      throw new Error(`Invalid check mode: ${checkMode}`);
    }

    const app = new TokenTrackerApp({
      wsConfig: {
        ...DEFAULT_WS_CONFIG,
        url: WS_URL,
      },
      rpcUrl: RPC_URL,
      liquidityPools: config.liquidity_pool,
      maxConcurrentTransactions: config.concurrent_transactions,
      checkMode,
      tokenBuy: {
        solAmount: config.token_buy.sol_amount,
        playSound: config.token_buy.play_sound,
        simulationMode: config.checks.simulation_mode,
      },
      tokenSell: {
        enabled: config.token_sell.enabled,
        stopLossPercent: config.token_sell.stop_loss_percent,
        takeProfitPercent: config.token_sell.take_profit_percent,
      },
      checkSettings: {
        allowMintAuthority: config.checks.settings.allow_mint_authority,
        allowFreezeAuthority: config.checks.settings.allow_freeze_authority,
        ignoreEndsWithPump: config.checks.settings.ignore_ends_with_pump,
      },
    });

    app.start();
  },
}; 