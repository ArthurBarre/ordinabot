import { Strategy } from '../core/types';
import { config } from '../config';
import { getTransfers, checkSolBalance, checkIfMintedToken, findLastWallet, watchForTokenCreation } from '../tracker/heliusTracker';

const START_ADDRESS = '5NvD4WGv3v92NX3HU9xhcVatFxYC9KpAqUtwX2924Hdo';

export const buyLastNodeStrategy: Strategy = {
  name: 'Buy Last Node',
  description: 'Watch wallets and track new token creation',
  type: 'buyLastNode',
  run: async () => {
    console.clear();
    console.log("🚀 Starting Helius fund-following trace...\n");

    const lastWallet = await findLastWallet(START_ADDRESS);
    await checkIfMintedToken(lastWallet);

    // Start watching for new token creation
    await watchForTokenCreation(lastWallet);
  },
}; 