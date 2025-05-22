import TelegramBot from 'node-telegram-bot-api';
import { snifferStrategy } from '../strategies/sniffer';
import { copytradingStrategy } from '../strategies/copytrading';
import { traceFundsStrategy } from '../strategies/traceFunds';
import { validateEnv } from '../utils/env-validator';

interface TraceConfig {
  rootAddress: string;
  minAmount: number;
  maxAmount: number;
  maxDepth: number;
}

// Track running strategies
interface ActiveStrategies {
  sniffer: boolean;
  copytrading: boolean;
  traceFunds: boolean;
}

class TelegramBotManager {
  private bot: TelegramBot;
  private chatId: string;
  private activeStrategies: ActiveStrategies = {
    sniffer: false,
    copytrading: false,
    traceFunds: false
  };
  private originalConsole: typeof console;
  private pendingTraceConfig: Partial<TraceConfig> = {};

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

  public start() {
    // Command handlers
    this.bot.onText(/\/start_sniffer/, () => this.startStrategy('sniffer'));
    this.bot.onText(/\/start_copytrading/, () => this.startStrategy('copytrading'));
    this.bot.onText(/\/trace_funds\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/, (msg, match) => this.handleTraceFundsCommand(msg, match));
    this.bot.onText(/\/stop/, () => this.stopAllStrategies());
    this.bot.onText(/\/status/, () => this.getStatus());

    // Welcome message
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      const welcome = `
🤖 Welcome to OrdinaBot!

Available commands:
/start_sniffer - Start token sniffer
/start_copytrading - Start copy trading
/trace_funds <address> <minAmount> <maxAmount> <maxDepth> - Start fund tracing
/stop - Stop all strategies
/status - Check running strategies

Example:
/trace_funds 7YttLkHDoNj9wyDur5pYeS7UJs7oKFSynuFQnTrqS2h 0.1 10 3

All console logs will be streamed here in real-time.
`;
      await this.bot.sendMessage(msg.chat.id, welcome);
    });

    console.log('🤖 Telegram bot started');
  }
}

export function launchTelegramBot(): void {
  const bot = new TelegramBotManager();
  bot.start();
} 