/**
 * Worker engine tests.
 *
 * Tests the main-thread RPC adapter (createWorkerEngine) using a stub worker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerResponse, WorkerRequest } from '../protocol';

// Minimal stub Worker for testing
// Uses a Map to store listeners so addEventListener and onmessage both work
type MessageListener = (event: { data: WorkerResponse }) => void;
class StubWorker {
  public sent: WorkerRequest[] = [];
  private listeners: Map<string, Set<MessageListener>> = new Map();
  public onmessage: MessageListener | null = null;

  postMessage(message: WorkerRequest) {
    this.sent.push(message);
    // Simulate async response for setRows
    if (message.type === 'setRows') {
      setTimeout(() => {
        const response = { data: { type: 'setRows:ok', requestId: message.requestId } };
        // Trigger both onmessage and addEventListener listeners
        this.onmessage?.(response);
        const listeners = this.listeners.get('message');
        listeners?.forEach((fn) => fn(response));
      }, 0);
    }
  }

  terminate() {}
  addEventListener(type: string, listener: MessageListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: MessageListener) {
    this.listeners.get(type)?.delete(listener);
  }
}

// Import after defining StubWorker (needs to be available)
import { createWorkerEngine } from '../engine/createWorkerEngine';

describe('createWorkerEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports createWorkerEngine', () => {
    expect(typeof createWorkerEngine).toBe('function');
  });

  it('returns an engine object with compute, computeChildren, setRows, and dispose', () => {
    const stub = new StubWorker();
    const engine = createWorkerEngine({ createWorker: () => stub });

    expect(typeof engine.compute).toBe('function');
    expect(typeof engine.computeChildren).toBe('function');
    expect(typeof engine.setRows).toBe('function');
    expect(typeof engine.dispose).toBe('function');
  });

  it('setRows sends setRows message to worker', async () => {
    const stub = new StubWorker();
    const engine = createWorkerEngine({ createWorker: () => stub });

    await engine.setRows([{ a: 1 }]);

    expect(stub.sent.some((m) => m.type === 'setRows')).toBe(true);
    const setRowsMsg = stub.sent.find((m) => m.type === 'setRows');
    expect(setRowsMsg?.rows).toEqual([{ a: 1 }]);
  });

  it('dispose terminates the worker', () => {
    const stub = new StubWorker();
    const terminateSpy = vi.spyOn(stub, 'terminate');
    const engine = createWorkerEngine({ createWorker: () => stub });

    engine.dispose();

    expect(terminateSpy).toHaveBeenCalled();
  });
});
