import { Strategy, CheckMode } from '../core/types';
import { TokenTrackerApp } from '../core/app';
import { DEFAULT_WS_CONFIG } from '../core/constants';
import { config } from '../config';
import { createInterface } from 'readline';
import WebSocket from 'ws';
import { buyToken } from '../utils/handlers/sniperooHandler';
import { getTokenAuthorities } from '../utils/handlers/tokenHandler';
import { playSound } from '../utils/notification';

export const followWalletStrategy: Strategy = {
  name: 'Follow Wallet',
  description: 'Follow and copy trades from a specific wallet',
  type: 'followWallet',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY || '950a6725-e50f-4a59-b71d-7326a5800091';
    const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Create readline interface for user input
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Prompt for wallet address
    const walletAddress = await new Promise<string>((resolve) => {
      rl.question('\n📝 Enter the wallet address to follow: ', (address) => {
        rl.close();
        resolve(address.trim());
      });
    });

    console.log(`\n🔍 Starting to follow wallet: ${walletAddress}`);
    console.log(`🔎 View on Solscan: https://solscan.io/account/${walletAddress}\n`);

    // Initialize WebSocket connection
    const ws = new WebSocket(WS_URL);

    const subscribeMsg = {
      jsonrpc: "2.0",
      id: 1,
      method: "accountSubscribe",
      params: [
        walletAddress,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
          transactionDetails: "full"
        }
      ]
    };

    ws.on('open', () => {
      console.log(`\n🔌 WebSocket connected, monitoring ${walletAddress}...`);
      ws.send(JSON.stringify(subscribeMsg));
    });

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (!response.params?.result?.value) return;

        const tx = response.params.result.value;
        const instructions = tx.transaction.message.instructions;

        // Look for token swap instructions
        for (const instruction of instructions) {
          // Check if this is a swap instruction (this is a simplified check)
          if (instruction.programId === 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB') { // Jupiter
            const postTokenBalances = tx.meta.postTokenBalances;
            if (!postTokenBalances || postTokenBalances.length === 0) continue;

            // Get the token being bought (last token in postTokenBalances)
            const boughtToken = postTokenBalances[postTokenBalances.length - 1];
            if (!boughtToken?.mint) continue;

            const mintAddress = boughtToken.mint;
            console.log('\n🚨 NEW TOKEN PURCHASE DETECTED! 🚨');
            console.log(`Time: ${new Date().toISOString()}`);
            console.log(`Mint Address: ${mintAddress}`);
            console.log(`View on Solscan: https://solscan.io/token/${mintAddress}\n`);

            // Perform security checks
            if (config.checks.mode === 'snipe') {
              console.log(`🔍 Performing ${config.checks.mode} check`);
              const tokenAuthorityStatus = await getTokenAuthorities(mintAddress);

              if (!tokenAuthorityStatus.isSecure) {
                if (!config.checks.settings.allow_mint_authority && tokenAuthorityStatus.hasMintAuthority) {
                  console.log("❌ Token has mint authority, skipping...");
                  continue;
                }
                if (!config.checks.settings.allow_freeze_authority && tokenAuthorityStatus.hasFreezeAuthority) {
                  console.log("❌ Token has freeze authority, skipping...");
                  continue;
                }
              }
              console.log("✅ Snipe check passed successfully");
            }

            // Buy token if not in simulation mode
            if (!config.checks.simulation_mode) {
              console.log("🔫 Sniping token using Sniperoo...");
              const result = await buyToken(
                mintAddress,
                config.token_buy.sol_amount,
                config.token_sell.enabled,
                config.token_sell.take_profit_percent,
                config.token_sell.stop_loss_percent
              );

              if (!result) {
                console.log("❌ Token not swapped. Sniperoo failed.");
                continue;
              }

              if (config.token_buy.play_sound) {
                playSound();
              }

              console.log("✅ Token swapped successfully using Sniperoo");
              console.log("👽 GMGN: https://gmgn.ai/sol/token/" + mintAddress);
              console.log("😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=" + mintAddress);
            } else {
              console.log("🧻 Token not swapped! Simulation Mode turned on.");
              if (config.token_buy.play_sound) {
                playSound("Token found in simulation mode");
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    // Keep the process running
    process.on('SIGINT', () => {
      ws.close();
      process.exit(0);
    });
  },
}; 