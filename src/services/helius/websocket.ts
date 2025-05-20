import WebSocket from 'ws';
import type { Data } from 'ws';
import { EventEmitter } from 'events';
import { WebSocketConfig } from '../../core/types';

export class HeliusWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private retryCount = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
  }

  public connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.config.url);
    this.setupEventHandlers();
  }

  public send(data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(data);
  }

  public close(): void {
    if (this.ws) {
      this.ws.close();
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.retryCount = 0;
      this.emit('open');
      if (this.config.debug) {
        console.log('WebSocket connected');
      }
    });

    this.ws.on('message', (data: Data) => {
      this.emit('message', data);
    });

    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
      if (this.config.debug) {
        console.error('WebSocket error:', error);
      }
    });

    this.ws.on('close', () => {
      this.emit('close');
      if (this.config.debug) {
        console.log('WebSocket closed');
      }
      this.handleReconnect();
    });
  }

  private handleReconnect(): void {
    if (this.retryCount >= this.config.maxRetries) {
      this.emit('maxRetriesReached');
      return;
    }

    const backoff = Math.min(
      this.config.initialBackoff * Math.pow(2, this.retryCount),
      this.config.maxBackoff
    );

    this.reconnectTimeout = setTimeout(() => {
      this.retryCount++;
      if (this.config.debug) {
        console.log(`Attempting to reconnect... (attempt ${this.retryCount})`);
      }
      this.connect();
    }, backoff);
  }
} 