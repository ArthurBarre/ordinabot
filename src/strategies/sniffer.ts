import { Strategy } from '../core/types';
import WebSocket from 'ws';
import fetch from 'node-fetch';

export const snifferStrategy: Strategy = {
  name: 'Sniffer',
  description: 'Track Active Token Buyers',
  type: 'sniffer',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY;
    if (!API_KEY) {
      console.error('❌ Missing HELIUS_API_KEY in environment variables.');
      process.exit(1);
    }

    const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Store wallet activity data
    const walletBuys = new Map<string, number>();

    // Subscribe to ALL token program transactions
    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']
        },
        {
          commitment: 'confirmed'
        }
      ]
    };

    // Analyze transaction to find token purchases
    async function handleSignature(signature: string) {
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

        // Check if this transaction is likely a token purchase
        const logs: string[] = tx.meta?.logMessages || [];
        const isBuy = logs.some(log =>
          log.includes('Instruction: TransferChecked') ||
          log.includes('Instruction: Transfer') ||
          log.includes('Instruction: Swap') ||
          log.includes('Program: Jupiter')
        );

        if (!isBuy) return;

        // Get payer/buyer address
        const payer = tx.transaction?.message?.accountKeys?.[0]?.pubkey;
        if (!payer) return;

        // Increment buy count
        walletBuys.set(payer, (walletBuys.get(payer) || 0) + 1);
        console.log(`🛒 ${payer.slice(0, 8)}... made a purchase - Total buys: ${walletBuys.get(payer)}`);
      } catch (err) {
        console.error(`❌ Error processing transaction ${signature}:`, err);
      }
    }

    console.log('🔍 Starting transaction sniffer...');
    console.log('Listening for token purchases for 120 seconds...\n');

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(WS_URL);
      let transactionsProcessed = 0;

      ws.on('open', () => {
        console.log('🔌 WebSocket connected to Helius');
        ws.send(JSON.stringify(subscribeMsg));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg?.params?.result?.value?.signature) {
            const signature = msg.params.result.value.signature;
            const logs = msg?.params?.result?.value?.logs || [];

            // Quick check for relevant transaction types
            const isTokenTx = logs.some((l: string) =>
              l.includes('Instruction: Transfer') ||
              l.includes('Instruction: TransferChecked') ||
              l.includes('Program: Jupiter')
            );

            if (isTokenTx) {
              handleSignature(signature);
              transactionsProcessed++;

              // Periodically log progress
              if (transactionsProcessed % 10 === 0) {
                console.log(`\n📊 Processed ${transactionsProcessed} transactions`);
                console.log(`👥 Tracking ${walletBuys.size} wallets\n`);
              }
            }
          }
        } catch (err) {
          console.error('❌ Error processing WebSocket message:', err);
        }
      });

      ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err);
      });

      // Set a longer timeout for more data collection
      const timeout = 120000; // 2 minutes
      setTimeout(() => {
        ws.close();

        // Generate statistics
        const buyStats = Array.from(walletBuys.entries())
          .map(([wallet, buys]) => ({
            address: `${wallet.slice(0, 8)}...${wallet.slice(-4)}`,
            buys
          }))
          .sort((a, b) => b.buys - a.buys);

        console.log('\n📊 Wallet Buy Activity:');
        console.table(buyStats);

        console.log(`\n👥 Total wallets tracked: ${walletBuys.size}`);
        console.log(`📊 Total transactions processed: ${transactionsProcessed}`);

        resolve();
      }, timeout);

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