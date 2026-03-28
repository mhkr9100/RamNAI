import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
  },
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
});

const noopAsync = () => Promise.resolve(null);
const noopAsyncArr = () => Promise.resolve([]);

Object.defineProperty(window, 'workspaceApp', {
  value: {
    workspace: { getSnapshot: vi.fn() },
    bridge: {
      listAgents: noopAsyncArr,
      sendMessage: noopAsync,
      getSessions: noopAsyncArr,
      getStatus: noopAsync,
      restartGateway: () => Promise.resolve(false),
      listChannels: noopAsyncArr,
      addChannel: () => Promise.resolve(false),
      removeChannel: () => Promise.resolve(false),
      getChannelStatus: noopAsyncArr,
    },
    voice: {
      getConfig: () => Promise.resolve({ enabled: false, wakeWord: '', preferredVoice: '', autoListen: false, ttsProvider: 'system' }),
      setConfig: noopAsync,
      sendTranscript: () => Promise.resolve({ type: 'response', text: '', timestamp: 0 }),
    },
  },
});
