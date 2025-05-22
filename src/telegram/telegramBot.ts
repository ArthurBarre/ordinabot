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
  private logBuffer: string[] = [];
  private isCollectingLogs = false;

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

      if (this.isCollectingLogs) {
        this.logBuffer.push(message);
      } else {
        chunkMessage(message).forEach(chunk => {
          this.bot.sendMessage(this.chatId, chunk)
            .catch((err: any) => originalError('Error sending to Telegram:', err));
        });
      }
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

      if (this.isCollectingLogs) {
        this.logBuffer.push('❌ ' + message);
      } else {
        chunkMessage('❌ ' + message).forEach(chunk => {
          this.bot.sendMessage(this.chatId, chunk)
            .catch((err: any) => originalError('Error sending to Telegram:', err));
        });
      }
    };
  }

  private async startCollectingLogs() {
    this.isCollectingLogs = true;
    this.logBuffer = [];
  }

  private async stopCollectingLogs(): Promise<string> {
    this.isCollectingLogs = false;
    const logs = this.logBuffer.join('\n');
    this.logBuffer = [];
    return logs;
  }

  private async askParameter(question: string): Promise<string> {
    const message = await this.bot.sendMessage(this.chatId, question, {
      reply_markup: {
        force_reply: true
      }
    });

    return new Promise((resolve) => {
      const listener = (msg: TelegramBot.Message) => {
        if (msg.reply_to_message?.message_id === message.message_id) {
          this.bot.removeListener('message', listener);
          resolve(msg.text || '');
        }
      };
      this.bot.on('message', listener);
    });
  }

  private async handleTraceFundsCommand(msg: TelegramBot.Message) {
    try {
      // Ask for address
      const address = await this.askParameter('📍 Please enter the address to trace:');
      if (address.length !== 44 && address.length !== 43) {
        await this.bot.sendMessage(this.chatId, '❌ Invalid Solana address (must be 43-44 characters)');
        return;
      }

      // Ask for minimum amount
      const minAmountStr = await this.askParameter('💰 Enter minimum SOL amount to trace (e.g. 0.1):');
      const minAmount = parseFloat(minAmountStr);
      if (isNaN(minAmount) || minAmount <= 0) {
        await this.bot.sendMessage(this.chatId, '❌ Minimum amount must be greater than 0');
        return;
      }

      // Ask for maximum amount
      const maxAmountStr = await this.askParameter('💰 Enter maximum SOL amount to trace (e.g. 10):');
      const maxAmount = parseFloat(maxAmountStr);
      if (isNaN(maxAmount) || maxAmount <= minAmount) {
        await this.bot.sendMessage(this.chatId, '❌ Maximum amount must be greater than minimum amount');
        return;
      }

      // Ask for depth
      const maxDepthStr = await this.askParameter('🔍 Enter maximum trace depth (1-200, recommended 3-5):');
      const maxDepth = parseInt(maxDepthStr);
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
    } catch (error) {
      console.error('Error in trace funds command:', error);
      await this.bot.sendMessage(this.chatId, '❌ An error occurred while processing your request');
    }
  }

  private async handleBacktraceFundsCommand(msg: TelegramBot.Message) {
    try {
      // Ask for address
      const address = await this.askParameter('📍 Please enter the address to backtrace:');
      if (address.length !== 44 && address.length !== 43) {
        await this.bot.sendMessage(this.chatId, '❌ Invalid Solana address (must be 43-44 characters)');
        return;
      }

      // Ask for minimum amount
      const minAmountStr = await this.askParameter('💰 Enter minimum SOL amount to trace (e.g. 0.1):');
      const minAmount = parseFloat(minAmountStr);
      if (isNaN(minAmount) || minAmount <= 0) {
        await this.bot.sendMessage(this.chatId, '❌ Minimum amount must be greater than 0');
        return;
      }

      // Ask for maximum amount
      const maxAmountStr = await this.askParameter('💰 Enter maximum SOL amount to trace (e.g. 10):');
      const maxAmount = parseFloat(maxAmountStr);
      if (isNaN(maxAmount) || maxAmount <= minAmount) {
        await this.bot.sendMessage(this.chatId, '❌ Maximum amount must be greater than minimum amount');
        return;
      }

      // Ask for depth
      const maxDepthStr = await this.askParameter('🔍 Enter maximum trace depth (1-200, recommended 3-5):');
      const maxDepth = parseInt(maxDepthStr);
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
    } catch (error) {
      console.error('Error in backtrace funds command:', error);
      await this.bot.sendMessage(this.chatId, '❌ An error occurred while processing your request');
    }
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
      `⏳ Starting Trace Funds...\n` +
      `📍 Root address: ${this.pendingTraceConfig.rootAddress}\n` +
      `💰 Amount range: ${this.pendingTraceConfig.minAmount} - ${this.pendingTraceConfig.maxAmount} SOL\n` +
      `🔍 Maximum depth: ${this.pendingTraceConfig.maxDepth}`
    );

    try {
      // Start collecting logs
      await this.startCollectingLogs();

      // Set environment variables for the strategy
      process.env.TRACE_ROOT_ADDRESS = this.pendingTraceConfig.rootAddress;
      process.env.TRACE_MIN_AMOUNT = this.pendingTraceConfig.minAmount?.toString();
      process.env.TRACE_MAX_AMOUNT = this.pendingTraceConfig.maxAmount?.toString();
      process.env.TRACE_MAX_DEPTH = this.pendingTraceConfig.maxDepth?.toString();

      await traceFundsStrategy.run();

      // Get collected logs and send summary
      const logs = await this.stopCollectingLogs();
      await this.bot.sendMessage(this.chatId, `✅ Trace Funds completed!\n\n📝 Summary:\n${logs}`);

      // Clean up environment variables
      delete process.env.TRACE_ROOT_ADDRESS;
      delete process.env.TRACE_MIN_AMOUNT;
      delete process.env.TRACE_MAX_AMOUNT;
      delete process.env.TRACE_MAX_DEPTH;
    } catch (error: any) {
      const logs = await this.stopCollectingLogs();
      console.error('Error in traceFunds:', error);
      this.activeStrategies.traceFunds = false;
      await this.bot.sendMessage(this.chatId, `❌ Trace Funds crashed: ${error.message}\n\n📝 Logs:\n${logs}`);
    }
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
      `⏳ Starting Backtrace Funds...\n` +
      `📍 Target address: ${this.pendingBacktraceConfig.targetAddress}\n` +
      `💰 Amount range: ${this.pendingBacktraceConfig.minAmount} - ${this.pendingBacktraceConfig.maxAmount} SOL\n` +
      `🔍 Maximum depth: ${this.pendingBacktraceConfig.maxDepth}`
    );

    try {
      // Start collecting logs
      await this.startCollectingLogs();

      // Set environment variables for the strategy
      process.env.BACKTRACE_TARGET_ADDRESS = this.pendingBacktraceConfig.targetAddress;
      process.env.BACKTRACE_MIN_AMOUNT = this.pendingBacktraceConfig.minAmount?.toString();
      process.env.BACKTRACE_MAX_AMOUNT = this.pendingBacktraceConfig.maxAmount?.toString();
      process.env.BACKTRACE_MAX_DEPTH = this.pendingBacktraceConfig.maxDepth?.toString();

      await backtraceFundsStrategy.run();

      // Get collected logs and send summary
      const logs = await this.stopCollectingLogs();
      await this.bot.sendMessage(this.chatId, `✅ Backtrace Funds completed!\n\n📝 Summary:\n${logs}`);

      // Clean up environment variables
      delete process.env.BACKTRACE_TARGET_ADDRESS;
      delete process.env.BACKTRACE_MIN_AMOUNT;
      delete process.env.BACKTRACE_MAX_AMOUNT;
      delete process.env.BACKTRACE_MAX_DEPTH;
    } catch (error: any) {
      const logs = await this.stopCollectingLogs();
      console.error('Error in backtraceFunds:', error);
      this.activeStrategies.backtraceFunds = false;
      await this.bot.sendMessage(this.chatId, `❌ Backtrace Funds crashed: ${error.message}\n\n📝 Logs:\n${logs}`);
    }
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

  public start() {
    // Command handlers
    this.bot.onText(/\/start_sniffer/, () => this.startStrategy('sniffer'));
    this.bot.onText(/\/start_copytrading/, () => this.startStrategy('copytrading'));
    this.bot.onText(/\/trace_funds/, (msg) => this.handleTraceFundsCommand(msg));
    this.bot.onText(/\/backtrace_funds/, (msg) => this.handleBacktraceFundsCommand(msg));
    this.bot.onText(/\/stop/, () => this.stopAllStrategies());
    this.bot.onText(/\/status/, () => this.getStatus());
    this.bot.onText(/\/help/, async (msg) => {
      const helpMessage = `
🤖 OrdinaBot Help

*Available Commands*

📊 Basic Commands:
• /help - Show this help message
• /status - Check running strategies
• /stop - Stop all running strategies

🔍 Sniffer & Copytrading:
• /start\\_sniffer - Start token sniffer
• /start\\_copytrading - Start copy trading

🔄 Fund Tracing:
• /trace\\_funds
  - Track outgoing funds from an address
  - The bot will ask you for:
    • Wallet address to trace
    • Minimum SOL amount
    • Maximum SOL amount
    • Trace depth

🔍 Fund Backtracing:
• /backtrace\\_funds
  - Track incoming funds to an address
  - The bot will ask you for the same parameters

*Tips*
• All amounts are in SOL
• Depth of 3-5 is recommended
• Keep amount range reasonable (e.g. 0.1-10 SOL)
• Results will be summarized at the end`;

      await this.bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
    });

    // Welcome message
    this.bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
      const welcome = `
🤖 Welcome to OrdinaBot\\!

Type /help to see all available commands\\.`;
      await this.bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
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