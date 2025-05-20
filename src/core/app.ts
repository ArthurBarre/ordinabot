import { HeliusWebSocketManager } from '../services/helius/websocket';
import { TokenAuthorityService } from '../services/token/authority';
import { SniperooService } from '../services/trading/sniperoo';
import { WebSocketConfig, LiquidityPool, CheckMode } from './types';
import { playSound } from '../utils/notification';
import type { Data } from 'ws';

export class TokenTrackerApp {
  private wsManager: HeliusWebSocketManager;
  private tokenService: TokenAuthorityService;
  private tradingService: SniperooService;
  private currentMint: string = '';
  private activeTransactions: number = 0;

  constructor(
    private config: {
      wsConfig: WebSocketConfig;
      rpcUrl: string;
      liquidityPools: LiquidityPool[];
      maxConcurrentTransactions: number;
      checkMode: CheckMode;
      tokenBuy: {
        solAmount: number;
        playSound: boolean;
        simulationMode: boolean;
      };
      tokenSell: {
        enabled: boolean;
        stopLossPercent: number;
        takeProfitPercent: number;
      };
      checkSettings: {
        allowMintAuthority: boolean;
        allowFreezeAuthority: boolean;
        ignoreEndsWithPump: boolean;
      };
    }
  ) {
    this.wsManager = new HeliusWebSocketManager(config.wsConfig);
    this.tokenService = new TokenAuthorityService(config.rpcUrl);
    this.tradingService = new SniperooService();
  }

  public start(): void {
    console.clear();
    console.log('🚀 Starting Solana Token Sniper...');

    this.wsManager.on('open', () => this.handleWebSocketOpen());
    this.wsManager.on('message', (data) => this.handleWebSocketMessage(data));
    this.wsManager.connect();
  }

  private handleWebSocketOpen(): void {
    const enabledPools = this.config.liquidityPools.filter(pool => pool.enabled);

    enabledPools.forEach(pool => {
      const subscriptionMessage = {
        jsonrpc: '2.0',
        id: pool.id,
        method: 'logsSubscribe',
        params: [
          { mentions: [pool.program] },
          { commitment: 'processed' }
        ]
      };
      this.wsManager.send(JSON.stringify(subscriptionMessage));
    });
  }

  private async handleWebSocketMessage(data: Data): Promise<void> {
    try {
      const parsedData = JSON.parse(data.toString());

      if (parsedData.result !== undefined && !parsedData.error) {
        console.log('✅ Subscription confirmed');
        return;
      }

      if (parsedData.error) {
        console.error('🚫 RPC Error:', parsedData.error);
        return;
      }

      const logs = parsedData?.params?.result?.value?.logs;
      const signature = parsedData?.params?.result?.value?.signature;

      if (!Array.isArray(logs) || !signature) return;

      const liquidityPoolInstructions = this.config.liquidityPools
        .filter(pool => pool.enabled)
        .map(pool => pool.instruction);

      const containsCreate = logs.some(log =>
        typeof log === 'string' &&
        liquidityPoolInstructions.some(instruction => log.includes(instruction))
      );

      if (!containsCreate || typeof signature !== 'string') return;

      await this.processTransaction(signature);
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    if (this.activeTransactions >= this.config.maxConcurrentTransactions) {
      console.log('⏳ Max concurrent transactions reached, skipping...');
      return;
    }

    this.activeTransactions++;

    try {
      console.log('================================================================');
      console.log('💦 New Liquidity Pool signature found');
      console.log(`🔍 https://solscan.io/tx/${signature}`);

      const mintAddress = await this.extractMintAddress(signature);
      if (!mintAddress) {
        console.log('❌ No valid token CA could be extracted');
        return;
      }

      if (this.currentMint === mintAddress) {
        console.log('⏭️ Skipping duplicate mint to prevent mint spamming');
        return;
      }

      this.currentMint = mintAddress;

      if (!(await this.performSecurityChecks(mintAddress))) {
        return;
      }

      await this.executeTrade(mintAddress);
    } finally {
      this.activeTransactions--;
    }
  }

  private async extractMintAddress(signature: string): Promise<string | null> {
    // Implementation would go here
    // This is a placeholder that would need to be implemented based on your specific needs
    return null;
  }

  private async performSecurityChecks(mintAddress: string): Promise<boolean> {
    if (this.config.checkMode === 'snipe') {
      console.log(`🔍 Performing ${this.config.checkMode} check`);
      const tokenAuthorityStatus = await this.tokenService.getTokenAuthorities(mintAddress);

      if (!tokenAuthorityStatus.isSecure) {
        if (!this.config.checkSettings.allowMintAuthority && tokenAuthorityStatus.hasMintAuthority) {
          console.log('❌ Token has mint authority, skipping...');
          return false;
        }
        if (!this.config.checkSettings.allowFreezeAuthority && tokenAuthorityStatus.hasFreezeAuthority) {
          console.log('❌ Token has freeze authority, skipping...');
          return false;
        }
      }

      console.log('✅ Snipe check passed successfully');
    } else if (this.config.checkMode === 'full') {
      if (mintAddress.trim().toLowerCase().endsWith('pump') && this.config.checkSettings.ignoreEndsWithPump) {
        console.log('❌ Token ends with pump, skipping...');
        return false;
      }
      // Additional full check implementation would go here
    }

    return true;
  }

  private async executeTrade(mintAddress: string): Promise<void> {
    if (this.config.tokenBuy.simulationMode) {
      console.log('🧻 Token not swapped! Simulation Mode turned on.');
      if (this.config.tokenBuy.playSound) {
        playSound('Token found in simulation mode');
      }
      return;
    }

    console.log('🔫 Sniping token using Sniperoo...');
    const result = await this.tradingService.buyToken(
      mintAddress,
      this.config.tokenBuy.solAmount,
      this.config.tokenSell.enabled,
      this.config.tokenSell.takeProfitPercent,
      this.config.tokenSell.stopLossPercent
    );

    if (!result.success) {
      console.log('❌ Token not swapped. Sniperoo failed.');
      return;
    }

    if (this.config.tokenBuy.playSound) {
      playSound();
    }

    console.log('✅ Token swapped successfully using Sniperoo');
    console.log(`👽 GMGN: https://gmgn.ai/sol/token/${mintAddress}`);
    console.log(`😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${mintAddress}`);
  }
} 