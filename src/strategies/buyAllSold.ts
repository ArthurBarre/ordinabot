import { Strategy } from '../core/types';
import WebSocket from 'ws';
import fetch from 'node-fetch';
import { buyToken } from '../utils/handlers/sniperooHandler';

export const buyAllSoldStrategy: Strategy = {
  name: 'Buy All Sold',
  description: 'Buy tokens when they are sold by a specific wallet',
  type: 'buyAllSold',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY;
    const WALLET_TO_FOLLOW = process.env.WALLET_TO_FOLLOW;

    if (!API_KEY) {
      console.error('❌ Missing HELIUS_API_KEY in environment variables.');
      process.exit(1);
    }

    if (!WALLET_TO_FOLLOW) {
      console.error('❌ Missing WALLET_TO_FOLLOW in environment variables.');
      process.exit(1);
    }

    const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Subscribe to transactions for the tracked wallet
    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [WALLET_TO_FOLLOW]
        },
        {
          commitment: 'confirmed'
        }
      ]
    };

    // Process transaction to find token transfers
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

        // Check if this transaction is a token transfer from our tracked wallet
        const logs: string[] = tx.meta?.logMessages || [];
        const isTransfer = logs.some(log =>
          log.includes('Instruction: TransferChecked') ||
          log.includes('Instruction: Transfer')
        );

        if (!isTransfer) return;

        // Verify the sender is our tracked wallet
        const accountKeys = tx.transaction.message.accountKeys;
        const sender = accountKeys[0].pubkey;
        if (sender !== WALLET_TO_FOLLOW) return;

        // Extract token mint address from the transaction
        let mintAddress = '';
        for (const key of accountKeys) {
          if (key.owner === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            mintAddress = key.pubkey;
            break;
          }
        }

        if (!mintAddress) return;

        console.log(`\n🔍 Detected transfer from ${sender.slice(0, 8)}...`);
        console.log(`💎 Token: ${mintAddress}`);
        console.log('🛍️ Attempting to buy token...');

        // Buy the token
        try {
          await buyToken(mintAddress, 0.1, false, 0, 0);
          console.log('✅ Buy order placed successfully');
        } catch (error) {
          console.error('❌ Failed to buy token:', error);
        }
      } catch (err) {
        console.error(`❌ Error processing transaction ${signature}:`, err);
      }
    }

    console.log(`🔍 Starting Buy All Sold strategy...`);
    console.log(`👀 Watching wallet: ${WALLET_TO_FOLLOW}\n`);

    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('🔌 WebSocket connected');
      ws.send(JSON.stringify(subscribeMsg));
    });

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (!response.params?.result?.value?.signature) return;
        await handleTransaction(response.params.result.value.signature);
      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket disconnected');
    });
  }
}; 