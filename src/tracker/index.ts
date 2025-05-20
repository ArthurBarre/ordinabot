import { findLastWallet, watchWalletWithWebSocket } from './heliusTracker';

const START_ADDRESS = '4gfQ9SwMDdWRPc6Dx3CL6x77eVfoRnjtQEiuRhfCzgAJ';

async function monitorWalletWithWebSocket(address: string) {
  console.log(`\n🎯 Starting WebSocket monitoring on wallet: ${address}`);

  await watchWalletWithWebSocket(address, (newWallet) => {
    console.log(`\n🔄 Switching to new wallet: ${newWallet}`);
    monitorWalletWithWebSocket(newWallet);
  });
}

(async () => {
  console.log("🚀 Starting Helius rugger tracking with WebSocket...\n");

  try {
    const lastWallet = await findLastWallet(START_ADDRESS);
    await monitorWalletWithWebSocket(lastWallet);
  } catch (error) {
    console.error('❌ Error in main process:', error);
    process.exit(1);
  }
})(); 