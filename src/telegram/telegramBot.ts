import TelegramBot from 'node-telegram-bot-api';
import { snifferStrategy } from '../strategies/sniffer';
import { copytradingStrategy } from '../strategies/copytrading';
import { traceFundsStrategy } from '../strategies/traceFunds';
import { backtraceFundsStrategy } from '../strategies/backtraceFunds';
import { validateEnv } from '../utils/env-validator';

interface TraceConfig {
  rootAddress: string;
  minAmount: number;
  maxAmount: number;
  maxDepth: number;
}

interface BacktraceConfig {
  targetAddress: string;
  minAmount: number;
  maxAmount: number;
  maxDepth: number;
}

// Track running strategies
interface ActiveStrategies {
  sniffer: boolean;
  copytrading: boolean;
  traceFunds: boolean;
  backtraceFunds: boolean;
}

class TelegramBotManager {
  private bot: TelegramBot;
  private chatId: string;
  private activeStrategies: ActiveStrategies = {
    sniffer: false,
    copytrading: false,
    traceFunds: false,
    backtraceFunds: false
  };
  private originalConsole: typeof console;
  private pendingTraceConfig: Partial<TraceConfig> = {};
  private pendingBacktraceConfig: Partial<BacktraceConfig> = {};

  constructor() {
    const env = validateEnv();
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN || '', { polling: true });
    this.chatId = env.TELEGRAM_CHAT_ID || '';
    this.originalConsole = { ...console };
    this.setupLogRedirection();
  }

  private setupLogRedirection() {
    // Store original console methods
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalError = console.error;

    // Helper to chunk long messages
    const chunkMessage = (text: string, maxLength = 4000): string[] => {
      const chunks: string[] = [];
      while (text.length > 0) {
        chunks.push(text.slice(0, maxLength));
        text = text.slice(maxLength);
      }
      return chunks;
    };

    // Override console methods
    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      chunkMessage(message).forEach(chunk => {
        this.bot.sendMessage(this.chatId, chunk)
          .catch((err: any) => originalError('Error sending to Telegram:', err));
      });
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      console.log('ℹ️', ...args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      chunkMessage('❌ ' + message).forEach(chunk => {
        this.bot.sendMessage(this.chatId, chunk)
          .catch((err: any) => originalError('Error sending to Telegram:', err));
      });
    };
  }

  private async startStrategy(strategy: keyof ActiveStrategies): Promise<void> {
    if (this.activeStrategies[strategy]) {
      await this.bot.sendMessage(this.chatId, `⚠️ ${strategy} is already running`);
      return;
    }

    this.activeStrategies[strategy] = true;
    await this.bot.sendMessage(this.chatId, `✅ Starting ${strategy}...`);

    try {
      switch (strategy) {
        case 'sniffer':
          await snifferStrategy.run();
          break;
        case 'copytrading':
          await copytradingStrategy.run();
          break;
        case 'traceFunds':
          await traceFundsStrategy.run();
          break;
        case 'backtraceFunds':
          await backtraceFundsStrategy.run();
          break;
      }
    } catch (error: any) {
      console.error(`Error in ${strategy}:`, error);
      this.activeStrategies[strategy] = false;
      await this.bot.sendMessage(this.chatId, `❌ ${strategy} crashed: ${error.message}`);
    }
  }

  private async stopAllStrategies(): Promise<void> {
    // Reset all flags
    Object.keys(this.activeStrategies).forEach(key => {
      this.activeStrategies[key as keyof ActiveStrategies] = false;
    });

    // Note: The actual stopping depends on the strategies implementing proper cleanup
    await this.bot.sendMessage(this.chatId, '🛑 All strategies stopped');
  }

  private async getStatus(): Promise<void> {
    const status = Object.entries(this.activeStrategies)
      .map(([name, active]) => `- ${name}: ${active ? '✅' : '❌'}`)
      .join('\n');

    await this.bot.sendMessage(this.chatId, `📊 Active strategies:\n${status}`);
  }

  private async handleTraceFundsCommand(msg: TelegramBot.Message, match: RegExpExecArray | null) {
    if (!match || match.length < 5) {
      await this.bot.sendMessage(this.chatId,
        'Usage: /trace_funds <address> <minAmount> <maxAmount> <maxDepth>\n' +
        'Example: /trace_funds 7YttLkHDoNj9wyDur5pYeS7UJs7oKFSynuFQnTrqS2h 0.1 10 3'
      );
      return;
    }

    const [, address, minAmountStr, maxAmountStr, maxDepthStr] = match;

    // Validate address
    if (address.length !== 44 && address.length !== 43) {
      await this.bot.sendMessage(this.chatId, '❌ Invalid Solana address (must be 43-44 characters)');
      return;
    }

    // Validate amounts
    const minAmount = parseFloat(minAmountStr);
    const maxAmount = parseFloat(maxAmountStr);
    const maxDepth = parseInt(maxDepthStr);

    if (isNaN(minAmount) || minAmount <= 0) {
      await this.bot.sendMessage(this.chatId, '❌ Minimum amount must be greater than 0');
      return;
    }

    if (isNaN(maxAmount) || maxAmount <= minAmount) {
      await this.bot.sendMessage(this.chatId, '❌ Maximum amount must be greater than minimum amount');
      return;
    }

    if (isNaN(maxDepth) || maxDepth <= 0 || maxDepth > 200) {
      await this.bot.sendMessage(this.chatId, '❌ Depth must be between 1 and 200');
      return;
    }

    // Store configuration
    this.pendingTraceConfig = {
      rootAddress: address,
      minAmount,
      maxAmount,
      maxDepth
    };

    // Start the strategy
    await this.startTraceFunds();
  }

  private async startTraceFunds(): Promise<void> {
    if (this.activeStrategies.traceFunds) {
      await this.bot.sendMessage(this.chatId, '⚠️ Trace Funds is already running');
      return;
    }

    if (!this.pendingTraceConfig.rootAddress) {
      await this.bot.sendMessage(this.chatId, '❌ No trace configuration set. Use /trace_funds command first.');
      return;
    }

    this.activeStrategies.traceFunds = true;
    await this.bot.sendMessage(this.chatId,
      `✅ Starting Trace Funds...\n` +
      `📍 Root address: ${this.pendingTraceConfig.rootAddress}\n` +
      `💰 Amount range: ${this.pendingTraceConfig.minAmount} - ${this.pendingTraceConfig.maxAmount} SOL\n` +
      `🔍 Maximum depth: ${this.pendingTraceConfig.maxDepth}`
    );

    try {
      // Set environment variables for the strategy
      process.env.TRACE_ROOT_ADDRESS = this.pendingTraceConfig.rootAddress;
      process.env.TRACE_MIN_AMOUNT = this.pendingTraceConfig.minAmount?.toString();
      process.env.TRACE_MAX_AMOUNT = this.pendingTraceConfig.maxAmount?.toString();
      process.env.TRACE_MAX_DEPTH = this.pendingTraceConfig.maxDepth?.toString();

      await traceFundsStrategy.run();

      // Clean up environment variables
      delete process.env.TRACE_ROOT_ADDRESS;
      delete process.env.TRACE_MIN_AMOUNT;
      delete process.env.TRACE_MAX_AMOUNT;
      delete process.env.TRACE_MAX_DEPTH;
    } catch (error: any) {
      console.error('Error in traceFunds:', error);
      this.activeStrategies.traceFunds = false;
      await this.bot.sendMessage(this.chatId, `❌ Trace Funds crashed: ${error.message}`);
    }
  }

  private async handleBacktraceFundsCommand(msg: TelegramBot.Message, match: RegExpExecArray | null) {
    if (!match || match.length < 5) {
      await this.bot.sendMessage(this.chatId,
        'Usage: /backtrace_funds <address> <minAmount> <maxAmount> <maxDepth>\n' +
        'Example: /backtrace_funds 7YttLkHDoNj9wyDur5pYeS7UJs7oKFSynuFQnTrqS2h 0.1 10 3'
      );
      return;
    }

    const [, address, minAmountStr, maxAmountStr, maxDepthStr] = match;

    // Validate address
    if (address.length !== 44 && address.length !== 43) {
      await this.bot.sendMessage(this.chatId, '❌ Invalid Solana address (must be 43-44 characters)');
      return;
    }

    // Validate amounts
    const minAmount = parseFloat(minAmountStr);
    const maxAmount = parseFloat(maxAmountStr);
    const maxDepth = parseInt(maxDepthStr);

    if (isNaN(minAmount) || minAmount <= 0) {
      await this.bot.sendMessage(this.chatId, '❌ Minimum amount must be greater than 0');
      return;
    }

    if (isNaN(maxAmount) || maxAmount <= minAmount) {
      await this.bot.sendMessage(this.chatId, '❌ Maximum amount must be greater than minimum amount');
      return;
    }

    if (isNaN(maxDepth) || maxDepth <= 0 || maxDepth > 200) {
      await this.bot.sendMessage(this.chatId, '❌ Depth must be between 1 and 200');
      return;
    }

    // Store configuration
    this.pendingBacktraceConfig = {
      targetAddress: address,
      minAmount,
      maxAmount,
      maxDepth
    };

    // Start the strategy
    await this.startBacktraceFunds();
  }

  private async startBacktraceFunds(): Promise<void> {
    if (this.activeStrategies.backtraceFunds) {
      await this.bot.sendMessage(this.chatId, '⚠️ Backtrace Funds is already running');
      return;
    }

    if (!this.pendingBacktraceConfig.targetAddress) {
      await this.bot.sendMessage(this.chatId, '❌ No backtrace configuration set. Use /backtrace_funds command first.');
      return;
    }

    this.activeStrategies.backtraceFunds = true;
    await this.bot.sendMessage(this.chatId,
      `✅ Starting Backtrace Funds...\n` +
      `📍 Target address: ${this.pendingBacktraceConfig.targetAddress}\n` +
      `💰 Amount range: ${this.pendingBacktraceConfig.minAmount} - ${this.pendingBacktraceConfig.maxAmount} SOL\n` +
      `🔍 Maximum depth: ${this.pendingBacktraceConfig.maxDepth}`
    );

    try {
      // Set environment variables for the strategy
      process.env.BACKTRACE_TARGET_ADDRESS = this.pendingBacktraceConfig.targetAddress;
      process.env.BACKTRACE_MIN_AMOUNT = this.pendingBacktraceConfig.minAmount?.toString();
      process.env.BACKTRACE_MAX_AMOUNT = this.pendingBacktraceConfig.maxAmount?.toString();
      process.env.BACKTRACE_MAX_DEPTH = this.pendingBacktraceConfig.maxDepth?.toString();

      await backtraceFundsStrategy.run();

      // Clean up environment variables
      delete process.env.BACKTRACE_TARGET_ADDRESS;
      delete process.env.BACKTRACE_MIN_AMOUNT;
      delete process.env.BACKTRACE_MAX_AMOUNT;
      delete process.env.BACKTRACE_MAX_DEPTH;
    } catch (error: any) {
      console.error('Error in backtraceFunds:', error);
      this.activeStrategies.backtraceFunds = false;
      await this.bot.sendMessage(this.chatId, `❌ Backtrace Funds crashed: ${error.message}`);
    }
  }

  public start() {
    // Command handlers
    this.bot.onText(/\/start_sniffer/, () => this.startStrategy('sniffer'));
    this.bot.onText(/\/start_copytrading/, () => this.startStrategy('copytrading'));
    this.bot.onText(/\/trace_funds\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/, (msg, match) => this.handleTraceFundsCommand(msg, match));
    this.bot.onText(/\/backtrace_funds\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/, (msg, match) => this.handleBacktraceFundsCommand(msg, match));
    this.bot.onText(/\/stop/, () => this.stopAllStrategies());
    this.bot.onText(/\/status/, () => this.getStatus());
    this.bot.onText(/\/help/, async (msg) => {
      const helpMessage = `
🤖 *OrdinaBot Help*

*Available Commands:*

📊 *Basic Commands:*
/help - Show this help message
/status - Check running strategies
/stop - Stop all running strategies

🔍 *Sniffer & Copytrading:*
/start_sniffer - Start token sniffer
/start_copytrading - Start copy trading

🔄 *Fund Tracing:*
/trace_funds <address> <minAmount> <maxAmount> <maxDepth>
- Track outgoing funds from an address
- Example: \`/trace_funds 7YttLkHDoNj9wyDur5pYeS7UJs7oKFSynuFQnTrqS2h 0.1 10 3\`
- Parameters:
  • address: Solana wallet address (43-44 chars)
  • minAmount: Minimum SOL amount to track (e.g. 0.1)
  • maxAmount: Maximum SOL amount to track (e.g. 10)
  • maxDepth: How many levels deep to trace (1-200)

🔍 *Fund Backtracing:*
/backtrace_funds <address> <minAmount> <maxAmount> <maxDepth>
- Track incoming funds to an address
- Example: \`/backtrace_funds 7YttLkHDoNj9wyDur5pYeS7UJs7oKFSynuFQnTrqS2h 0.1 10 3\`
- Parameters: Same as trace_funds

*Tips:*
• All amounts are in SOL
• Depth of 3-5 is recommended for most cases
• Keep amount range reasonable (e.g. 0.1-10 SOL)
• All console logs will be streamed here in real-time
`;

      await this.bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
    });

    // Welcome message
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      const welcome = `
🤖 Welcome to OrdinaBot!

Type /help to see all available commands and how to use them.

All console logs will be streamed here in real-time.
`;
      await this.bot.sendMessage(msg.chat.id, welcome);
    });

    // Add error handling for commands
    this.bot.on('message', async (msg) => {
      const text = msg.text;
      if (!text) return;

      // Check if it's a command but not handled by other handlers
      if (text.startsWith('/')) {
        const command = text.split(' ')[0];
        const validCommands = ['/start', '/help', '/status', '/stop', '/start_sniffer', '/start_copytrading', '/trace_funds', '/backtrace_funds'];

        if (!validCommands.some(cmd => command === cmd)) {
          await this.bot.sendMessage(msg.chat.id, '❌ Invalid command. Type /help to see available commands.');
        }
      }
    });

    console.log('🤖 Telegram bot started');
  }
}

export function launchTelegramBot(): void {
  const bot = new TelegramBotManager();
  bot.start();
} 