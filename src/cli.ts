import { Command } from 'commander';
import inquirer from 'inquirer';
import { snifferStrategy } from './strategies/sniffer';
import { copytradingStrategy } from './strategies/copytrading';
import { traceFundsStrategy } from './strategies/traceFunds';
import { baseTradingStrategy } from './strategies/baseTrading';
import { followWalletStrategy } from './strategies/followWallet';
import { buyLastNodeStrategy } from './strategies/buyLastNode';
import { buyAllSoldStrategy } from './strategies/buyAllSold';
import { backtraceFundsStrategy } from './strategies/backtraceFunds';
import { Strategy } from './core/types';
import 'dotenv/config';

const program = new Command();

// Map des stratégies disponibles
const strategies = {
  sniffer: snifferStrategy,
  copytrading: copytradingStrategy,
  traceFunds: traceFundsStrategy,
  baseTrading: baseTradingStrategy,
  followWallet: followWalletStrategy,
  buyLastNode: buyLastNodeStrategy,
  buyAllSold: buyAllSoldStrategy,
  backtraceFunds: backtraceFundsStrategy
};

// Configuration des paramètres pour chaque stratégie
const strategyParams = {
  traceFunds: [
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
  ],
  buyAllSold: [
    {
      type: 'input',
      name: 'walletToFollow',
      message: 'Enter the wallet address to follow:',
      validate: (input: string) => {
        if (input.length === 44 || input.length === 43) {
          return true;
        }
        return 'Please enter a valid Solana address (43-44 characters)';
      }
    }
  ],
  backtraceFunds: [
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
  ]
};

async function runStrategy(strategyName: string) {
  const strategy = strategies[strategyName as keyof typeof strategies];

  if (!strategy) {
    console.error(`❌ Strategy "${strategyName}" not found`);
    return;
  }

  console.log(`\n🚀 Starting ${strategy.name}...`);

  try {
    // Si la stratégie a des paramètres, les demander
    if (strategyParams[strategyName as keyof typeof strategyParams]) {
      const params = await inquirer.prompt(strategyParams[strategyName as keyof typeof strategyParams]);

      // Configurer les variables d'environnement pour la stratégie
      if (strategyName === 'traceFunds') {
        process.env.TRACE_ROOT_ADDRESS = params.rootAddress;
        process.env.TRACE_MIN_AMOUNT = params.minAmount.toString();
        process.env.TRACE_MAX_AMOUNT = params.maxAmount.toString();
        process.env.TRACE_MAX_DEPTH = params.maxDepth.toString();
      } else if (strategyName === 'buyAllSold') {
        process.env.WALLET_TO_FOLLOW = params.walletToFollow;
      } else if (strategyName === 'backtraceFunds') {
        process.env.BACKTRACE_TARGET_ADDRESS = params.targetAddress;
        process.env.BACKTRACE_MIN_AMOUNT = params.minAmount.toString();
        process.env.BACKTRACE_MAX_AMOUNT = params.maxAmount.toString();
        process.env.BACKTRACE_MAX_DEPTH = params.maxDepth.toString();
      }
    }

    await strategy.run();
  } catch (error) {
    console.error(`❌ Error running ${strategy.name}:`, error);
  }
}

program
  .name('ordinabot-cli')
  .description('CLI for running OrdinaBot strategies')
  .version('1.0.0');

program
  .command('strategy <name>')
  .description('Run a specific strategy')
  .action(runStrategy);

program
  .command('list')
  .description('List all available strategies')
  .action(() => {
    console.log('\n📋 Available strategies:');
    Object.entries(strategies).forEach(([name, strategy]) => {
      console.log(`- ${name}: ${strategy.description}`);
    });
    console.log();
  });

program.parse(); 