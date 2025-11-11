import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { WebSocketClient } from '../services/WebSocketClient';
import { NetworkMessageType } from '../types/network';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Simulate successful send
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    const closeEvent = new CloseEvent('close', { code: code || 1000, reason });
    this.onclose?.(closeEvent);
  }

  ping() {
    // Mock ping method
  }
}

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

describe('WebSocket Fixes', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    client = new WebSocketClient({
      url: 'ws://localhost:8080',
      reconnectInterval: 100,
      maxReconnectAttempts: 3,
      heartbeatInterval: 1000,
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  it('should connect successfully', async () => {
    const connectPromise = client.connect();
    await expect(connectPromise).resolves.toBeUndefined();
    expect(client.isWebSocketConnected()).toBe(true);
  });

  it('should handle connection timeout', async () => {
    // Mock a WebSocket that never opens
    class TimeoutWebSocket extends MockWebSocket {
      constructor(url: string) {
        super(url);
        this.readyState = MockWebSocket.CONNECTING;
        // Never call onopen
      }
    }

    (global as any).WebSocket = TimeoutWebSocket;

    const client = new WebSocketClient({
      url: 'ws://localhost:8080',
      reconnectInterval: 100,
      maxReconnectAttempts: 1,
    });

    await expect(client.connect()).rejects.toThrow(
      'WebSocket connection timeout'
    );
  });

  it('should validate message size before sending', async () => {
    await client.connect();

    // Create a large message (over 64KB)
    const largeMessage = {
      type: NetworkMessageType.HEARTBEAT,
      payload: { data: 'x'.repeat(70000) },
      timestamp: new Date(),
    };

    const result = client.sendMessage(largeMessage);
    expect(result).toBe(false);
  });

  it('should handle reconnection properly', async () => {
    await client.connect();
    expect(client.isWebSocketConnected()).toBe(true);

    // Simulate connection loss
    const mockSocket = (client as any).socket;
    mockSocket.readyState = MockWebSocket.CLOSED;
    mockSocket.onclose(new CloseEvent('close', { code: 1006 }));

    // Wait for reconnection attempt
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(client.getReconnectAttempts()).toBeGreaterThan(0);
  });

  it('should not attempt reconnection on manual disconnect', async () => {
    await client.connect();

    const initialAttempts = client.getReconnectAttempts();

    // Manual disconnect (code 1000)
    const mockSocket = (client as any).socket;
    mockSocket.onclose(new CloseEvent('close', { code: 1000 }));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(client.getReconnectAttempts()).toBe(initialAttempts);
  });

  it('should clean up resources on disconnect', () => {
    const disconnectSpy = jest.spyOn(client, 'disconnect');

    client.disconnect();

    expect(disconnectSpy).toHaveBeenCalled();
    expect(client.isWebSocketConnected()).toBe(false);
  });
});
