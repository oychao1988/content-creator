import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

class MockChildProcess extends EventEmitter {
  pid = 12345;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

describe('ClaudeCLIService (stream-json parsing)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should parse stream-json output across chunk boundaries', async () => {
    const childProcess = await import('child_process');
    const spawnMock = childProcess.spawn as unknown as ReturnType<typeof vi.fn>;

    const proc = new MockChildProcess();

    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        const stream =
          '{"type":"system","subtype":"init"}' +
          '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}' +
          '{"type":"assistant","message":{"content":[{"type":"text","text":" world"}]}}' +
          '{"type":"result","subtype":"success","result":"hello world"}';

        proc.stdout.write(stream.slice(0, 40));
        proc.stdout.write(stream.slice(40, 85));
        proc.stdout.write(stream.slice(85));

        proc.emit('close', 0);
      });

      return proc as any;
    });

    const { ClaudeCLIService } = await import('../../src/services/llm/ClaudeCLIService.js');

    const service = new ClaudeCLIService({ defaultTimeout: 5000 });
    const result = await service.chat({
      messages: [{ role: 'user', content: 'x' }],
      stream: true,
    });

    expect(result.content).toBe('hello world');

    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain('-p');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--include-partial-messages');
  });

  it('should parse json output on close (non-stream)', async () => {
    const childProcess = await import('child_process');
    const spawnMock = childProcess.spawn as unknown as ReturnType<typeof vi.fn>;

    const proc = new MockChildProcess();

    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        const payload = JSON.stringify([
          {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'hi' }],
            },
          },
          {
            type: 'result',
            result: {
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          },
        ]);

        proc.stdout.write(payload.slice(0, 10));
        proc.stdout.write(payload.slice(10));

        proc.emit('close', 0);
      });

      return proc as any;
    });

    const { ClaudeCLIService } = await import('../../src/services/llm/ClaudeCLIService.js');

    const service = new ClaudeCLIService({ defaultTimeout: 5000 });
    const result = await service.chat({
      messages: [{ role: 'user', content: 'x' }],
      stream: false,
    });

    expect(result.content).toBe('hi');

    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).not.toContain('stream-json');
  });
});
