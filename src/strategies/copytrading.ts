import { Strategy } from '../core/types';
import WebSocket from 'ws';
import fetch from 'node-fetch';
import { buyToken } from '../utils/handlers/sniperooHandler';
import { config } from '../config';
import { playSound } from '../utils/notification';

// List of wallets to track (these are example addresses, replace with real ones)
const WALLETS_TO_FOLLOW = [
  "9JKBzujgUQJo8Rwtw3bii2FUgdRNC6zsuxB91NBaoVUH",
"21fJDGZXcLPy62d4SnHs69bcjSVnSz9Nqu5iQ3fFhqfs",
"9LXWa7V3AE15VfBupcx5gDts2ix3Y9NzbcKZKjkkq6hV",
"8rskYPmUDKZUTBsxTH74pAz2qNa5wdTKmtanFWCWhWbA",
"J95FHyvCKo7rkU2UeRNV69HymE3qCozHZYZBfneDdHQz",
];

export const copytradingStrategy: Strategy = {
  name: 'Copytrading',
  description: 'Automatically copy trades from successful wallets',
  type: 'copytrading',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY;
    if (!API_KEY) {
      console.error('❌ Missing HELIUS_API_KEY in environment variables.');
      process.exit(1);
    }

    const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Subscribe to transactions for all tracked wallets
    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: WALLETS_TO_FOLLOW
        },
        {
          commitment: 'confirmed'
        }
      ]
    };

    // Process transaction to find token purchases
    async function handleTransaction(signature: string) {
      try {
        const res = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]
          })
        });

        const json = await res.json();
        const tx = json.result;
        if (!tx) return;

        // Check if this transaction is a token purchase
        const logs: string[] = tx.meta?.logMessages || [];
        const isBuy = logs.some(log =>
          log.includes('Instruction: TransferChecked') ||
          log.includes('Instruction: Transfer') ||
          log.includes('Instruction: Swap') ||
          log.includes('Program: Jupiter')
        );

        if (!isBuy) return;

        // Get the wallet that made the purchase
        const payer = tx.transaction?.message?.accountKeys?.[0]?.pubkey;
        if (!payer || !WALLETS_TO_FOLLOW.includes(payer)) return;

        // Extract token mint address from the transaction
        let mintAddress = '';
        for (const key of tx.transaction.message.accountKeys) {
          if (key.owner === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            mintAddress = key.pubkey;
            break;
          }
        }

        if (!mintAddress) return;

        console.log(`\n🔍 Detected purchase by ${payer.slice(0, 8)}...`);
        console.log(`💎 Token: ${mintAddress}`);

        // Copy the trade using Sniperoo
        if (!config.checks?.simulation_mode) {
          console.log("🔫 Copying trade using Sniperoo...");
          const result = await buyToken(
            mintAddress,
            config.token_buy.sol_amount,
            config.token_sell.enabled,
            config.token_sell.take_profit_percent,
            config.token_sell.stop_loss_percent
          );

          if (!result) {
            console.log("❌ Failed to copy trade");
            return;
          }

          if (config.token_buy.play_sound) {
            playSound();
          }

          console.log("✅ Successfully copied trade");
          console.log(`👽 GMGN: https://gmgn.ai/sol/token/${mintAddress}`);
          console.log(`😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${mintAddress}`);
        } else {
          console.log("🧻 Trade not copied - Simulation Mode is enabled");
          if (config.token_buy.play_sound) {
            playSound("Trade found in simulation mode");
          }
        }
      } catch (err) {
        console.error(`❌ Error processing transaction ${signature}:`, err);
      }
    }

    console.log('🔄 Starting copytrading strategy...');
    console.log('👥 Tracking the following wallets:');
    WALLETS_TO_FOLLOW.forEach(wallet => console.log(`   ${wallet}`));
    console.log('\n');

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        console.log('🔌 WebSocket connected to Helius');
        ws.send(JSON.stringify(subscribeMsg));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.params?.result?.value?.signature) {
            handleTransaction(msg.params.result.value.signature);
          }
        } catch (err) {
          console.error('❌ Error processing WebSocket message:', err);
        }
      });

      ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err);
      });

      // Clean shutdown handling
      ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
          console.log('\n👋 Gracefully shutting down...');
          ws.close();
          process.exit(0);
        });
      });
    });
  }
}; 