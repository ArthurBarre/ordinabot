import { Strategy } from '../core/types';
import fetch from 'node-fetch';
import { sleep } from '../utils/sleep';
import * as fs from 'fs';
import * as path from 'path';
const inquirer = require('inquirer');

interface BacktraceConfig {
  targetAddress: string;
  minAmount: number;
  maxAmount: number;
  maxDepth: number;
}

interface TransferNode {
  address: string;
  amount: number;
  parent: TransferNode | null;
  depth: number;
  timestamp: string;
  signature: string;
  links: {
    solscan: string;
    bullx: string;
  };
}

interface BacktraceExport {
  config: BacktraceConfig;
  timestamp: string;
  chains: TransferNode[];
  stats: {
    totalAddresses: number;
    totalAmount: number;
    maxDepthReached: number;
    oldestTransaction: string;
    newestTransaction: string;
  };
}

// Rate limiting setup (reused from traceFunds)
const RATE_LIMIT = {
  windowMs: 2000, // 2 seconds window
  maxRequests: 4, // 4 requests per window
  queue: [] as number[],
  lastReset: Date.now()
};

// Helper function to make RPC calls with rate limiting (reused from traceFunds)
async function rpcCall(url: string, method: string, params: any[], retries = 3): Promise<any> {
  const now = Date.now();
  if (now - RATE_LIMIT.lastReset > RATE_LIMIT.windowMs) {
    RATE_LIMIT.queue = [];
    RATE_LIMIT.lastReset = now;
  }

  RATE_LIMIT.queue = RATE_LIMIT.queue.filter(time => now - time < RATE_LIMIT.windowMs);

  if (RATE_LIMIT.queue.length >= RATE_LIMIT.maxRequests) {
    const waitTime = RATE_LIMIT.windowMs - (now - RATE_LIMIT.queue[0]);
    await sleep(waitTime);
    return rpcCall(url, method, params, retries);
  }

  RATE_LIMIT.queue.push(now);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method,
        params
      })
    });

    const data = await response.json();

    if (data.error) {
      if (data.error.code === -32429 && retries > 0) {
        console.log(`Rate limit hit, waiting ${RATE_LIMIT.windowMs}ms before retry...`);
        await sleep(RATE_LIMIT.windowMs);
        return rpcCall(url, method, params, retries - 1);
      }
      throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed, retrying... (${retries} retries left)`);
      await sleep(1000);
      return rpcCall(url, method, params, retries - 1);
    }
    throw error;
  }
}

function generateLinks(address: string) {
  return {
    solscan: `https://solscan.io/account/${address}`,
    bullx: `https://neo.bullx.io/terminal?chainId=1399811149&address=${address}`
  };
}

async function getIncomingTransfers(
  rpcUrl: string,
  address: string,
  visited: Set<string>,
  config: BacktraceConfig,
  depth = 0,
  parent: TransferNode | null = null
): Promise<TransferNode[]> {
  if (depth >= config.maxDepth || visited.has(address)) {
    return [];
  }

  visited.add(address);
  const nodes: TransferNode[] = [];

  try {
    // Get recent transactions
    const signatures = await rpcCall(rpcUrl, 'getSignaturesForAddress', [
      address,
      { limit: 50 } // Increased limit to find more incoming transfers
    ]);

    for (const sig of signatures) {
      const tx = await rpcCall(rpcUrl, 'getTransaction', [
        sig.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
      ]);

      if (!tx) continue;

      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const accountKeys = tx.transaction.message.accountKeys;

      // Look for SOL transfers TO our target address
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i].pubkey === address) {
          const received = (postBalances[i] - preBalances[i]) / 1e9;

          // Check if this is an incoming transfer within our amount range
          if (received >= config.minAmount && received <= config.maxAmount) {
            // Find the sender(s)
            for (let j = 0; j < accountKeys.length; j++) {
              if (i === j) continue;

              const sent = (preBalances[j] - postBalances[j]) / 1e9;
              if (sent >= config.minAmount && sent <= config.maxAmount) {
                const sourceAddress = accountKeys[j].pubkey;

                console.log(`🔍 [Depth ${depth}] ${sourceAddress.slice(0, 8)}... → Sent ${sent.toFixed(4)} SOL to ${address.slice(0, 8)}...`);

                // Create node for this transfer
                const node: TransferNode = {
                  address: sourceAddress,
                  amount: sent,
                  parent,
                  depth,
                  timestamp: new Date(tx.blockTime * 1000).toISOString(),
                  signature: sig.signature,
                  links: generateLinks(sourceAddress)
                };

                // Recursively trace transfers to this sender
                const parentNodes = await getIncomingTransfers(rpcUrl, sourceAddress, visited, config, depth + 1, node);
                nodes.push(node, ...parentNodes);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error tracing transfers to ${address}:`, error);
  }

  return nodes;
}

function printTransferChain(node: TransferNode) {
  let current: TransferNode | null = node;
  const chain: string[] = [];

  while (current) {
    const addressShort = current.address.slice(0, 8) + '...';
    chain.push(`${addressShort} (${current.amount.toFixed(4)} SOL)`);
    current = current.parent;
  }

  console.log(chain.join(' → '));
  console.log(`🔍 View latest transfer: https://solscan.io/tx/${node.signature}\n`);
}

function ensureExportDir(): string {
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }
  return exportDir;
}

function generateExportFilename(targetAddress: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backtrace_${targetAddress.slice(0, 8)}_${timestamp}.json`;
}

async function exportBacktraceResults(results: BacktraceExport): Promise<string> {
  const exportDir = ensureExportDir();
  const filename = generateExportFilename(results.config.targetAddress);
  const filepath = path.join(exportDir, filename);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify(results, null, 2),
    'utf8'
  );

  return filepath;
}

function calculateStats(chains: TransferNode[]): {
  totalAmount: number;
  maxDepth: number;
  oldestTx: string;
  newestTx: string;
} {
  let totalAmount = 0;
  let maxDepth = 0;
  let oldestTx = new Date().toISOString();
  let newestTx = new Date(0).toISOString();

  chains.forEach(node => {
    totalAmount += node.amount;
    maxDepth = Math.max(maxDepth, node.depth);
    oldestTx = node.timestamp < oldestTx ? node.timestamp : oldestTx;
    newestTx = node.timestamp > newestTx ? node.timestamp : newestTx;
  });

  return {
    totalAmount,
    maxDepth,
    oldestTx,
    newestTx
  };
}

async function promptConfig(): Promise<BacktraceConfig> {
  // If environment variables are set, use them
  if (process.env.BACKTRACE_TARGET_ADDRESS) {
    return {
      targetAddress: process.env.BACKTRACE_TARGET_ADDRESS,
      minAmount: parseFloat(process.env.BACKTRACE_MIN_AMOUNT || '0.1'),
      maxAmount: parseFloat(process.env.BACKTRACE_MAX_AMOUNT || '100'),
      maxDepth: parseInt(process.env.BACKTRACE_MAX_DEPTH || '5')
    };
  }

  // Otherwise use interactive prompt
  const questions = [
    {
      type: 'input',
      name: 'targetAddress',
      message: 'Enter the target address to backtrace:',
      validate: (input: string) => {
        if (input.length === 44 || input.length === 43) {
          return true;
        }
        return 'Please enter a valid Solana address (43-44 characters)';
      }
    },
    {
      type: 'number',
      name: 'minAmount',
      message: 'Enter minimum SOL amount to trace:',
      default: 0.1,
      validate: (input: number) => {
        if (input > 0) {
          return true;
        }
        return 'Amount must be greater than 0';
      }
    },
    {
      type: 'number',
      name: 'maxAmount',
      message: 'Enter maximum SOL amount to trace:',
      default: 100,
      validate: (input: number, answers: any) => {
        if (input > answers.minAmount) {
          return true;
        }
        return 'Maximum amount must be greater than minimum amount';
      }
    },
    {
      type: 'number',
      name: 'maxDepth',
      message: 'Enter maximum trace depth:',
      default: 5,
      validate: (input: number) => {
        if (input > 0 && input <= 200) {
          return true;
        }
        return 'Depth must be between 1 and 200';
      }
    }
  ];

  return inquirer.prompt(questions);
}

export const backtraceFundsStrategy: Strategy = {
  name: 'Backtrace Funds',
  description: 'Recursively trace incoming SOL transfers to find source wallets',
  type: 'backtraceFunds',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY;
    if (!API_KEY) {
      console.error('❌ Missing HELIUS_API_KEY in environment variables.');
      process.exit(1);
    }

    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Get configuration from user
    const config = await promptConfig();

    console.log('\n🔍 Starting fund backtracing...');
    console.log(`Target address: ${config.targetAddress}`);
    console.log(`Amount range: ${config.minAmount} - ${config.maxAmount} SOL`);
    console.log(`Maximum depth: ${config.maxDepth}\n`);

    const visited = new Set<string>();
    const transferChains = await getIncomingTransfers(RPC_URL, config.targetAddress, visited, config);

    // Calculate statistics
    const { totalAmount, maxDepth, oldestTx, newestTx } = calculateStats(transferChains);

    // Prepare export data
    const exportData: BacktraceExport = {
      config,
      timestamp: new Date().toISOString(),
      chains: transferChains,
      stats: {
        totalAddresses: visited.size,
        totalAmount,
        maxDepthReached: maxDepth,
        oldestTransaction: oldestTx,
        newestTransaction: newestTx
      }
    };

    // Export results
    const exportPath = await exportBacktraceResults(exportData);

    console.log('\n📊 Transfer Chains:');
    console.log('================\n');
    for (const chain of transferChains) {
      printTransferChain(chain);
    }

    if (transferChains.length === 0) {
      console.log('No transfers found within the specified range.');
    }

    console.log('\n📈 Statistics:');
    console.log('================');
    console.log(`Total addresses analyzed: ${visited.size}`);
    console.log(`Total SOL transferred: ${totalAmount.toFixed(4)} SOL`);
    console.log(`Maximum depth reached: ${maxDepth}`);
    console.log(`Date range: ${new Date(oldestTx).toLocaleString()} → ${new Date(newestTx).toLocaleString()}`);
    console.log(`\n💾 Results exported to: ${exportPath}`);

    console.log('\n✅ Backtracing complete');
  }
}; 