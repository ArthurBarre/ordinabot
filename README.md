This repository contains all the code "as is", following the "Solana PumpSwap Sniper Trading Bot in TypeScript" on YouTube provided by [DigitalBenjamins](https://x.com/digbenjamins).

Solana PumpSwap Sniper Trading Bot in TypeScript | Buy fast with JITO and Sell | pump.fun migration

[![Solana Sniper Trading Bot in TypeScript](https://img.youtube.com/vi/eQ8osFo5Df4/0.jpg)](https://www.youtube.com/watch?v=eQ8osFo5Df4)

## Project Description

The Solana PumpSwap trading sniper 2025 is a TypeScript (node.js) bot designed to automate the buying of (meme) tokens on the Solana blockchain.
It is configured to execute trades based on predefined checks and parameters like amount, slipage, rug check and priority. It checks for migration from pumpfun to pumpswap

With customizable parameters, you can tailor the strategy to suit your needs. The primary goal of this project is to educate users about the essential components required to develop a simple token sniper, offering insights into its functionality and implementation!

### Features

- Token Sniper for PumpSwap and Raydium for the Solana blockchain
- Rug check using a third party service rugcheck.xyz
- Possibility to skip pump.fun tokens
- Auto-buy with parameters for amount, slippage and priority using JITO
- Sell automatically using stop loss and Take profit
- Possibility to set own RPC nodes
- Snipe using JITO sniper Sniperoo

### Available Strategies

The bot includes several trading strategies that can be run independently:

#### 1. Base Trading Strategy (`baseTrading`)
- Core trading strategy using TokenTrackerApp
- Configurable parameters for token buying and selling
- Includes rug checks, liquidity pool monitoring, and market analysis
- Supports stop-loss and take-profit functionality
- Uses JITO for priority transactions

#### 2. Sniffer Strategy (`sniffer`)
- Monitors all token program transactions on Solana
- Tracks wallets making frequent token purchases
- Identifies active traders and potential pump signals
- Logs wallet activity and purchase patterns
- Useful for identifying trending tokens and active traders

#### 3. Copytrading Strategy (`copytrading`)
- Automatically copies trades from successful wallets
- Monitors a predefined list of expert traders
- Detects token purchases and replicates them
- Uses Jupiter for swap execution
- Includes transaction validation and error handling

#### 4. Trace Funds Strategy (`traceFunds`)
- Recursively traces SOL transfers between wallets
- Configurable parameters:
  - Root address to start tracing from
  - Minimum and maximum SOL amounts to track
  - Maximum trace depth
- Generates detailed transfer trees
- Exports results with wallet links and statistics
- Useful for investigating fund flows and wallet relationships

#### 5. Follow Wallet Strategy (`followWallet`)
- Similar to copytrading but focuses on a single wallet
- Monitors specific wallet for token swap instructions
- Particularly watches Jupiter program interactions
- Provides real-time notifications of purchases
- Includes Solscan links for purchased tokens

#### 6. Buy Last Node Strategy (`buyLastNode`)
- Tracks a specific starting address
- Follows fund transfers to find the last wallet in a chain
- Monitors for new token creation by the final wallet
- Useful for catching new token launches early

#### 7. Buy All Sold Strategy (`buyAllSold`)
- Monitors a specific wallet for token transfers
- When the watched wallet sells/transfers a token:
  - Automatically identifies the token address
  - Attempts to buy the same token using Sniperoo
- Useful for reverse psychology trading (buying what others sell)
- Real-time WebSocket monitoring for instant execution

### Prerequisites, Installation and Usage Instructions

1. Ensure [Node.js](https://nodejs.org/en) is installed on your computer.
2. Clone the repository to your local machine.
3. Navigate to the project folder and run the following command to install all dependencies: "npm i"
4. Create a `.env` file with your configuration:
   ```env
   HELIUS_API_KEY=your_helius_api_key
   SNIPEROO_API_KEY=your_sniperoo_api_key
   SNIPEROO_PUBKEY=your_sniperoo_pubkey
   ```

### Running Strategies

You can run strategies in two ways:

1. Using the CLI:
   ```bash
   npm run cli list              # List all available strategies
   npm run cli strategy <name>   # Run a specific strategy
   ```

2. Using the Telegram bot:
   ```bash
   npm run bot                   # Start the Telegram bot
   ```
   Then use these commands in Telegram:
   - `/start_sniffer` - Start token sniffer
   - `/start_copytrading` - Start copy trading
   - `/trace_funds <address> <minAmount> <maxAmount> <maxDepth>` - Start fund tracing
   - `/stop` - Stop all strategies
   - `/status` - Check running strategies

### Third Party documentation

- [Helius RPC nodes](https://docs.helius.dev)
- [Sniperoo](https://www.sniperoo.app/signup?ref=IZ7ZYZEV)
- [Rugcheck API](https://api.rugcheck.xyz/swagger/index.html)
- [Solana](https://solana.com/docs)
- [Solscan](https://solscan.io)

### Disclaimer

The course videos accompanying this project are provided free of charge and are intended solely for educational purposes. This software does not guarantee profitability or financial success and is not designed to generate profitable trades.

You are solely responsible for your own financial decisions. Before making any trades or investments, it is strongly recommended that you consult with a qualified financial professional.

By using this software, you acknowledge that the creators and contributors of this project shall not be held liable for any financial losses, damages, or other consequences resulting from its use. Use the software at your own risk.

The software (code in this repository) must not be used to engage in any form of market manipulation, fraud, illegal activities, or unethical behavior. The creators of this project do not endorse or support malicious use cases, such as front-running, exploiting contracts, or harming other users. Users are expected to adhere to ethical trading practices and comply with applicable laws and regulations.

The software (code in this repository) is intended solely to facilitate learning and enhance the educational experience provided by the accompanying videos. Any other use is strictly prohibited.

All trading involves risk and may not be suitable for all individuals. You should carefully consider your investment objectives, level of experience, and risk appetite before engaging in any trading activities. Past performance is not indicative of future results, and there is no guarantee that any trading strategy, algorithm or tool discussed will result in profits or avoid losses.

I am not a licensed financial advisor or a registered broker-dealer. The content shared is based solely on personal experience and knowledge and should not be relied upon as financial advice or a guarantee of success. Always conduct your own research and consult with a professional financial advisor before making any investment decisions.
