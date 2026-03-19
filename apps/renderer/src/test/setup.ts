import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
  },
});

// Mock clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
});

// Mock electron API
Object.defineProperty(window, 'supreme', {
  value: {
    workspace: {
      getSnapshot: vi.fn(),
    },
    // Mock other potential methods if needed
  },
});
