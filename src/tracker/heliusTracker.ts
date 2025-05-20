import fetch from 'node-fetch';
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { buyToken } from '../utils/handlers/sniperooHandler';
import { config } from '../config';
import { getTokenAuthorities } from '../utils/handlers/tokenHandler';
import { getRugCheckConfirmed } from '../utils/handlers/rugCheckHandler';
import { playSound } from '../utils/notification';
import WebSocket from 'ws';

const API_KEY = process.env.HELIUS_API_KEY || "950a6725-e50f-4a59-b71d-7326a5800091";
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

// Helper function to wait
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiting setup
const RATE_LIMIT = {
  windowMs: 2000,    // 2 seconds window
  maxRequests: 4,    // 4 requests per window
  queue: [] as number[],
  lastReset: Date.now()
};

// Constantes pour les limites de transfert
const MIN_TRANSFER_SOL = 0.01;
const MAX_TRANSFER_SOL = 1000000;

// Helper function to make RPC calls with rate limiting
async function rpcCall(method: string, params: any[], retries = 3): Promise<any> {
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
    return rpcCall(method, params, retries);
  }

  // Add current request to queue
  RATE_LIMIT.queue.push(now);

  try {
    const response = await fetch(RPC_URL, {
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
        return rpcCall(method, params, retries - 1);
      }
      throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed, retrying... (${retries} retries left)`);
      await sleep(1000);
      return rpcCall(method, params, retries - 1);
    }
    throw error;
  }
}

export async function getTransfers(address: string): Promise<string | null> {
  console.log(`📤 Getting transfers from ${address}...`);
  console.log(`🔎 View on Solscan: https://solscan.io/account/${address}\n`);

  try {
    const signatures = await rpcCall('getSignaturesForAddress', [
      address,
      { limit: 10 }
    ]);

    for (const sig of signatures) {
      const tx = await rpcCall('getTransaction', [
        sig.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
      ]);

      if (!tx) continue;

      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const accountKeys = tx.transaction.message.accountKeys;

      for (let i = 0; i < accountKeys.length; i++) {
        const diff = (preBalances[i] - postBalances[i]) / 1e9;
        if (accountKeys[i].pubkey === address && diff >= MIN_TRANSFER_SOL && diff <= MAX_TRANSFER_SOL) {
          for (let j = 0; j < accountKeys.length; j++) {
            const received = (postBalances[j] - preBalances[j]) / 1e9;
            if (received >= MIN_TRANSFER_SOL && received <= MAX_TRANSFER_SOL) {
              console.log(`➡ ${address} → ${accountKeys[j].pubkey} | ${received.toFixed(4)} SOL`);
              return accountKeys[j].pubkey;
            }
          }
        }
      }
    }

    console.log(`📪 No transfers found between ${MIN_TRANSFER_SOL} and ${MAX_TRANSFER_SOL} SOL`);
    return null;
  } catch (error) {
    console.error('Error getting transfers:', error);
    return null;
  }
}

export async function checkSolBalance(address: string): Promise<number | null> {
  console.log(`💰 Checking SOL balance for ${address}...`);
  console.log(`🔎 View on Solscan: https://solscan.io/account/${address}\n`);

  try {
    const response = await rpcCall('getBalance', [address]);
    const balance = response.value;

    if (typeof balance !== 'number') {
      console.error('❌ Invalid balance response:', response);
      return null;
    }

    const balanceInSOL = balance / 1e9;
    console.log(`Balance: ${balanceInSOL.toFixed(4)} SOL`);

    if (balance > 0) {
      console.log(`\n💎 Wallet Details:`);
      console.log(`- Raw balance in lamports: ${balance}`);
      console.log(`- SOL balance: ${balanceInSOL.toFixed(9)} SOL`);
      console.log(`- USD value (@ $150/SOL): $${(balanceInSOL * 150).toFixed(2)}`);
    }

    return balanceInSOL;
  } catch (error) {
    console.error('Error checking balance:', error);
    return null;
  }
}

export async function checkIfMintedToken(address: string): Promise<string | null> {
  console.log(`🔍 Checking for token mint activity from ${address}...`);
  console.log(`🔎 View on Solscan: https://solscan.io/account/${address}\n`);

  try {
    const signatures = await rpcCall('getSignaturesForAddress', [
      address,
      { limit: 20 }
    ]);

    for (const sig of signatures) {
      const tx = await rpcCall('getTransaction', [
        sig.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
      ]);

      if (!tx) continue;

      for (const instruction of tx.transaction.message.instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'initializeMint') {
          console.log(`🪙 Detected token mint! Mint address: ${instruction.parsed.info.mint}`);
          return instruction.parsed.info.mint;
        }
      }
    }

    console.log("📭 No token mint activity found.");
    return null;
  } catch (error) {
    console.error('❌ Error checking for token mint:', error);
    return null;
  }
}

export async function findLastWallet(start: string): Promise<string> {
  const visited = new Set<string>();
  let current = start;

  while (true) {
    if (visited.has(current)) break;
    visited.add(current);

    const next = await getTransfers(current);
    if (!next || visited.has(next)) {
      console.log(`✅ Final wallet found: ${current}`);
      const balance = await checkSolBalance(current);
      if (balance !== null) {
        console.log(`📊 Final wallet balance: ${balance.toFixed(4)} SOL`);
      }
      return current;
    }

    current = next;
  }

  return current;
}

export async function watchForTokenCreation(address: string): Promise<void> {
  console.log(`\n👀 Starting token creation watch on ${address}...`);
  console.log(`🔎 View on Solscan: https://solscan.io/account/${address}`);
  console.log('Checking every 10 seconds for new tokens...\n');

  const seenSignatures = new Set<string>();
  let checkCount = 0;
  let lastCheck = Date.now();

  while (true) {
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheck;
    if (timeSinceLastCheck < 10000) {
      await sleep(10000 - timeSinceLastCheck);
    }
    lastCheck = Date.now();

    checkCount++;
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n[${timestamp}] 🔍 Check #${checkCount}...`);

    try {
      const signatures = await rpcCall('getSignaturesForAddress', [
        address,
        { limit: 3 }
      ]);

      let foundNewToken = false;

      for (const sig of signatures) {
        if (seenSignatures.has(sig.signature)) continue;

        await sleep(500);

        const tx = await rpcCall('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
        ]);

        seenSignatures.add(sig.signature);
        if (!tx) continue;

        for (const instruction of tx.transaction.message.instructions) {
          if (instruction.program === 'spl-token' && instruction.parsed?.type === 'initializeMint') {
            const mintAddress = instruction.parsed.info.mint;
            console.log('\n🚨 NEW TOKEN CREATED! 🚨');
            console.log(`Time: ${new Date().toISOString()}`);
            console.log(`Mint Address: ${mintAddress}`);
            console.log(`View on Solscan: https://solscan.io/token/${mintAddress}\n`);
            foundNewToken = true;

            // Perform security checks based on configuration
            if (config.checks.mode === 'snipe') {
              console.log(`🔍 Performing ${config.checks.mode} check`);
              const tokenAuthorityStatus = await getTokenAuthorities(mintAddress);
              if (!tokenAuthorityStatus.isSecure) {
                const allowMintAuthority = config.checks.settings.allow_mint_authority || false;
                const allowFreezeAuthority = config.checks.settings.allow_freeze_authority || false;
                if (!allowMintAuthority && tokenAuthorityStatus.hasMintAuthority) {
                  console.log("❌ Token has mint authority, skipping...");
                  continue;
                }
                if (!allowFreezeAuthority && tokenAuthorityStatus.hasFreezeAuthority) {
                  console.log("❌ Token has freeze authority, skipping...");
                  continue;
                }
              }
              console.log("✅ Snipe check passed successfully");
            } else if (config.checks.mode === 'full') {
              if (mintAddress.trim().toLowerCase().endsWith('pump') && config.checks.settings.ignore_ends_with_pump) {
                console.log("❌ Token ends with pump, skipping...");
                continue;
              }
              const isRugCheckPassed = await getRugCheckConfirmed(mintAddress);
              if (!isRugCheckPassed) {
                console.log("❌ Full rug check not passed, skipping...");
                continue;
              }
            }

            // Buy token using Sniperoo if enabled
            if (config.token_buy.provider === 'sniperoo' && !config.checks.simulation_mode) {
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
            }

            // Output simulation mode warning
            if (config.checks.simulation_mode) {
              console.log("🧻 Token not swapped! Simulation Mode turned on.");
              if (config.token_buy.play_sound) {
                playSound("Token found in simulation mode");
              }
            }
          }
        }
      }

      if (!foundNewToken) {
        console.log('😴 No new token creation detected');
      }

      if (seenSignatures.size > 100) {
        const oldestToKeep = Array.from(seenSignatures).slice(-50);
        seenSignatures.clear();
        oldestToKeep.forEach(sig => seenSignatures.add(sig));
      }
    } catch (error) {
      console.error('❌ Error in token watch:', error);
      await sleep(10000);
    }
  }
}

export async function watchWalletWithWebSocket(address: string, onNewWallet?: (wallet: string) => void): Promise<void> {
  const ws = new WebSocket(WS_URL);

  const subscribeMsg = {
    jsonrpc: "2.0",
    id: 1,
    method: "accountSubscribe",
    params: [
      address,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        transactionDetails: "full"
      }
    ]
  };

  ws.on('open', () => {
    console.log(`\n🔌 WebSocket connected, monitoring ${address}...`);
    ws.send(JSON.stringify(subscribeMsg));
  });

  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const response = JSON.parse(data.toString());
      if (!response.params?.result?.value?.account?.data) return;
      const tx = response.params.result.value;

      // Check for token creation
      for (const instruction of tx.transaction.message.instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'initializeMint') {
          const mintAddress = instruction.parsed.info.mint;
          console.log('\n🚨 NEW TOKEN CREATED! 🚨');
          console.log(`Time: ${new Date().toISOString()}`);
          console.log(`Mint Address: ${mintAddress}`);
          console.log(`View on Solscan: https://solscan.io/token/${mintAddress}\n`);

          // Vérifications minimales essentielles
          try {
            // 1. Vérification de l'autorité de mint (la plus importante)
            const tokenAuthorityStatus = await getTokenAuthorities(mintAddress);
            if (tokenAuthorityStatus.hasMintAuthority) {
              console.log("⚠️ Token has mint authority - Higher risk but proceeding...");
            }

            // 2. Vérification rapide du nom (éviter les pièges évidents)
            if (mintAddress.toLowerCase().includes("rug") || mintAddress.toLowerCase().includes("scam")) {
              console.log("❌ Suspicious token name, skipping...");
              continue;
            }

            // Achat du token
            if (config.token_buy.provider === 'sniperoo' && !config.checks.simulation_mode) {
              console.log("🔫 Sniping token using Sniperoo...");
              const result = await buyToken(
                mintAddress,
                config.token_buy.sol_amount,
                true, // Active la vente auto par défaut
                200, // Take profit à 200%
                30   // Stop loss à 30%
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
            }
          } catch (error) {
            console.error("Error in token checks:", error);
            // En cas d'erreur dans les vérifications, on continue quand même
            // car c'est mieux de prendre le risque que de rater une opportunité
          }
        }
      }

      // Check for transfers
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const accountKeys = tx.transaction.message.accountKeys;

      for (let i = 0; i < accountKeys.length; i++) {
        const diff = (preBalances[i] - postBalances[i]) / 1e9;
        if (accountKeys[i].pubkey === address && diff >= MIN_TRANSFER_SOL && diff <= MAX_TRANSFER_SOL) {
          for (let j = 0; j < accountKeys.length; j++) {
            const received = (postBalances[j] - preBalances[j]) / 1e9;
            if (received >= MIN_TRANSFER_SOL && received <= MAX_TRANSFER_SOL) {
              const newWallet = accountKeys[j].pubkey;
              console.log(`\n🚨 Funds moved! ${address} → ${newWallet} | ${received.toFixed(4)} SOL`);
              console.log(`💡 Transfer amount within target range (${MIN_TRANSFER_SOL}-${MAX_TRANSFER_SOL} SOL)`);

              const balance = await checkSolBalance(newWallet);
              if (balance && balance >= MIN_TRANSFER_SOL) {
                console.log(`\n🔀 Valid balance found in new wallet: ${balance} SOL`);
                if (onNewWallet) {
                  ws.close();
                  onNewWallet(newWallet);
                }
              } else {
                console.log(`\n⚠️ New wallet balance too low or too high: ${balance} SOL`);
              }
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
}