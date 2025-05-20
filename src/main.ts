import 'dotenv/config';
import { Strategy, StrategyType } from './core/types';
import { baseTradingStrategy } from './strategies/baseTrading';
import { buyLastNodeStrategy } from './strategies/buyLastNode';
import { followWalletStrategy } from './strategies/followWallet';

// Use require for inquirer since it's CommonJS
const inquirer = require('inquirer');

const strategies: Strategy[] = [
  baseTradingStrategy,
  buyLastNodeStrategy,
  followWalletStrategy,
];

async function selectStrategy(): Promise<Strategy> {
  const { strategy } = await inquirer.prompt([
    {
      type: 'list',
      name: 'strategy',
      message: 'Select a trading strategy to run:',
      choices: strategies.map(s => ({
        name: `${s.name} - ${s.description}`,
        value: s.type,
      })),
    },
  ]);

  const selectedStrategy = strategies.find(s => s.type === strategy);
  if (!selectedStrategy) {
    throw new Error(`Invalid strategy selected: ${strategy}`);
  }

  return selectedStrategy;
}

async function main() {
  console.clear();
  console.log('🤖 Solana Trading Bot\n');

  try {
    const strategy = await selectStrategy();
    console.log(`\n🚀 Starting ${strategy.name}...\n`);
    await strategy.run();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

// Start the application
main(); 