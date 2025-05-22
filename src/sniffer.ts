import 'dotenv/config';
import WebSocket from 'ws';

interface WalletStats {
  wallet: string;
  uniqueTokens: number;
  lastSeen: string;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number;
    uiAmountString: string;
  };
}

// Initialize WebSocket connection
const API_KEY = process.env.HELIUS_API_KEY || '950a6725-e50f-4a59-b71d-7326a5800091';
const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

// Track tokens bought per wallet
const walletTokens = new Map<string, Set<string>>();

// Subscribe to all transactions
const subscribeMsg = {
  jsonrpc: '2.0',
  id: 1,
  method: 'logsSubscribe',
  params: [
    { mentions: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] }, // Token Program
    { commitment: 'confirmed' }
  ]
};

function handleTransaction(tx: any): void {
  try {
    const instructions = tx.transaction.message.instructions;
    const postTokenBalances = tx.meta.postTokenBalances as TokenBalance[];
    const preTokenBalances = tx.meta.preTokenBalances as TokenBalance[];

    // Skip if no token balances changes
    if (!postTokenBalances || !preTokenBalances) return;

    // Look for new token account creations and transfers
    for (const instruction of instructions) {
      // Check for token transfers or account creations
      if (instruction.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        // Find new token accounts that weren't in preTokenBalances
        const newTokenAccounts = postTokenBalances.filter(post =>
          !preTokenBalances.some(pre => pre.accountIndex === post.accountIndex)
        );

        for (const newAccount of newTokenAccounts) {
          const owner = newAccount.owner;
          const mint = newAccount.mint;

          // Skip if missing data
          if (!owner || !mint) continue;

          // Initialize Set for new wallets
          if (!walletTokens.has(owner)) {
            walletTokens.set(owner, new Set());
          }

          // Add token to wallet's set
          walletTokens.get(owner)?.add(mint);
        }
      }
    }
  } catch (error) {
    console.error('Error processing transaction:', error);
  }
}

console.log('🔍 Starting bot sniffer...');
console.log('Listening for token transactions for 30 seconds...\n');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('🔌 WebSocket connected');
  ws.send(JSON.stringify(subscribeMsg));
});

ws.on('message', (data: WebSocket.Data) => {
  try {
    const response = JSON.parse(data.toString());

    // Skip subscription confirmation
    if (response.result !== undefined) return;

    // Process transaction
    if (response.params?.result?.value) {
      handleTransaction(response.params.result.value);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

// Close after 30 seconds and display results
setTimeout(() => {
  ws.close();

  // Convert Map to array of stats
  const stats: WalletStats[] = Array.from(walletTokens.entries()).map(([wallet, tokens]) => ({
    wallet,
    uniqueTokens: tokens.size,
    lastSeen: new Date().toISOString()
  }));

  // Sort by number of unique tokens
  stats.sort((a, b) => b.uniqueTokens - a.uniqueTokens);

  // Only show wallets that bought more than 1 token
  const activeBots = stats.filter(stat => stat.uniqueTokens > 1);

  console.log('\n🤖 Active Bot Summary:');
  console.table(activeBots);

  console.log(`\nTotal wallets tracked: ${walletTokens.size}`);
  console.log(`Active bots detected: ${activeBots.length}`);

  process.exit(0);
}, 30000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  ws.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  ws.close();
  process.exit(0);
}); 