import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

// Component to trigger toast actions
const TestComponent = () => {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Success!', 'Details')}>Show Success</button>
      <button onClick={() => toast.error('Error!')}>Show Error</button>
    </div>
  );
};

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('ToastProvider renders children', () => {
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('useToast().success() adds a toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('toasts auto-dismiss after duration', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    // After the timeout, the toast is removed from state and AnimatePresence
    // runs an exit animation. In jsdom the element may linger briefly.
    await vi.waitFor(() => {
      expect(screen.queryByText('Success!')).not.toBeInTheDocument();
    });
  });

  it('useToast().error() adds an error toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Error'));
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  it('dismiss button removes toast', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    
    const dismissButton = screen.getByRole('button', { name: 'Close notification' });
    fireEvent.click(dismissButton);
    
    await vi.waitFor(() => {
      expect(screen.queryByText('Success!')).not.toBeInTheDocument();
    });
  });
});
