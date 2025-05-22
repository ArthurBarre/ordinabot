import { Strategy } from '../core/types';
import fetch from 'node-fetch';
import { sleep } from '../utils/sleep';
import * as fs from 'fs';
import * as path from 'path';
const inquirer = require('inquirer');

interface TraceConfig {
  rootAddress: string;
  minAmount: number;
  maxAmount: number;
  maxDepth: number;
}

interface TransferNode {
  address: string;
  amount: number;
  children: TransferNode[];
  depth: number;
  links: {
    solscan: string;
    bullx: string;
  };
}

interface TraceExport {
  config: TraceConfig;
  timestamp: string;
  tree: TransferNode[];
  stats: {
    totalAddresses: number;
    totalAmount: number;
    maxDepthReached: number;
  };
}

// Rate limiting setup
const RATE_LIMIT = {
  windowMs: 2000, // 2 seconds window
  maxRequests: 4, // 4 requests per window
  queue: [] as number[],
  lastReset: Date.now()
};

// Helper function to make RPC calls with rate limiting
async function rpcCall(url: string, method: string, params: any[], retries = 3): Promise<any> {
  // Rate limiting logic
  const now = Date.now();
  if (now - RATE_LIMIT.lastReset > RATE_LIMIT.windowMs) {
    RATE_LIMIT.queue = [];
    RATE_LIMIT.lastReset = now;
  }

  // Remove old requests from queue
  RATE_LIMIT.queue = RATE_LIMIT.queue.filter(time => now - time < RATE_LIMIT.windowMs);

  // If queue is full, wait for next window
  if (RATE_LIMIT.queue.length >= RATE_LIMIT.maxRequests) {
    const waitTime = RATE_LIMIT.windowMs - (now - RATE_LIMIT.queue[0]);
    await sleep(waitTime);
    return rpcCall(url, method, params, retries);
  }

  // Add current request to queue
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

async function getTransfers(
  rpcUrl: string,
  address: string,
  visited: Set<string>,
  config: TraceConfig,
  depth = 0
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
      { limit: 20 }
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

      // Look for SOL transfers from our target address
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i].pubkey === address) {
          const sent = (preBalances[i] - postBalances[i]) / 1e9;

          // Check if this is an outgoing transfer within our amount range
          if (sent >= config.minAmount && sent <= config.maxAmount) {
            // Find the recipient(s)
            for (let j = 0; j < accountKeys.length; j++) {
              if (i === j) continue;

              const received = (postBalances[j] - preBalances[j]) / 1e9;
              if (received >= config.minAmount && received <= config.maxAmount) {
                const destinationAddress = accountKeys[j].pubkey;

                console.log(`🔍 [Depth ${depth}] ${address.slice(0, 8)}... → Sent ${received.toFixed(4)} SOL to ${destinationAddress.slice(0, 8)}...`);

                // Recursively trace transfers from this recipient
                const childNodes = await getTransfers(rpcUrl, destinationAddress, visited, config, depth + 1);

                nodes.push({
                  address: destinationAddress,
                  amount: received,
                  children: childNodes,
                  depth,
                  links: generateLinks(destinationAddress)
                });
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error tracing transfers from ${address}:`, error);
  }

  return nodes;
}

function printTransferTree(node: TransferNode, prefix = '') {
  const addressShort = node.address.slice(0, 8) + '...';
  console.log(`${prefix}${addressShort} (${node.amount.toFixed(4)} SOL)`);
  console.log(`${prefix}🔍 Solscan: ${node.links.solscan}`);
  console.log(`${prefix}📊 BullX: ${node.links.bullx}\n`);

  for (const child of node.children) {
    printTransferTree(child, prefix + '  ');
  }
}

function ensureExportDir(): string {
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }
  return exportDir;
}

function generateExportFilename(rootAddress: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `trace_${rootAddress.slice(0, 8)}_${timestamp}.json`;
}

async function exportTraceResults(results: TraceExport): Promise<string> {
  const exportDir = ensureExportDir();
  const filename = generateExportFilename(results.config.rootAddress);
  const filepath = path.join(exportDir, filename);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify(results, null, 2),
    'utf8'
  );

  return filepath;
}

function calculateStats(tree: TransferNode[]): { totalAmount: number; maxDepth: number } {
  let totalAmount = 0;
  let maxDepth = 0;

  function traverse(node: TransferNode) {
    totalAmount += node.amount;
    maxDepth = Math.max(maxDepth, node.depth);
    node.children.forEach(traverse);
  }

  tree.forEach(traverse);
  return { totalAmount, maxDepth };
}

async function promptConfig(): Promise<TraceConfig> {
  const questions = [
    {
      type: 'input',
      name: 'rootAddress',
      message: 'Enter the root address to trace:',
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
      default: 3,
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

export const traceFundsStrategy: Strategy = {
  name: 'Trace Funds',
  description: 'Recursively trace SOL transfers between wallets',
  type: 'traceFunds',
  run: async () => {
    const API_KEY = process.env.HELIUS_API_KEY;
    if (!API_KEY) {
      console.error('❌ Missing HELIUS_API_KEY in environment variables.');
      process.exit(1);
    }

    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

    // Get configuration from user
    const config = await promptConfig();

    console.log('\n🔍 Starting fund tracing...');
    console.log(`Root address: ${config.rootAddress}`);
    console.log(`Amount range: ${config.minAmount} - ${config.maxAmount} SOL`);
    console.log(`Maximum depth: ${config.maxDepth}\n`);

    const visited = new Set<string>();
    const transferTree = await getTransfers(RPC_URL, config.rootAddress, visited, config);

    // Calculate statistics
    const { totalAmount, maxDepth } = calculateStats(transferTree);

    // Prepare export data
    const exportData: TraceExport = {
      config,
      timestamp: new Date().toISOString(),
      tree: transferTree,
      stats: {
        totalAddresses: visited.size,
        totalAmount,
        maxDepthReached: maxDepth
      }
    };

    // Export results
    const exportPath = await exportTraceResults(exportData);

    console.log('\n📊 Transfer Tree:');
    console.log('================\n');
    for (const node of transferTree) {
      printTransferTree(node);
    }

    if (transferTree.length === 0) {
      console.log('No transfers found within the specified range.');
    }

    console.log('\n📈 Statistics:');
    console.log('================');
    console.log(`Total addresses analyzed: ${visited.size}`);
    console.log(`Total SOL transferred: ${totalAmount.toFixed(4)} SOL`);
    console.log(`Maximum depth reached: ${maxDepth}`);
    console.log(`\n💾 Results exported to: ${exportPath}`);

    console.log('\n✅ Tracing complete');
  }
}; 