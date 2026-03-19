import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '../workspace-store';
import { getDesktopApi } from '@/lib/electron';

// Mock electron API wrapper
vi.mock('@/lib/electron', () => ({
  getDesktopApi: vi.fn(() => ({
    workspace: {
      getSnapshot: vi.fn(),
    },
  })),
}));

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      snapshot: null,
      loading: false,
      error: null,
      notice: null,
    });
    vi.clearAllMocks();
  });

  it('initial state is correct', () => {
    const state = useWorkspaceStore.getState();
    expect(state.snapshot).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.notice).toBeNull();
  });

  it('setError sets the error', () => {
    useWorkspaceStore.getState().setError('something went wrong');
    expect(useWorkspaceStore.getState().error).toBe('something went wrong');
  });

  it('clearError clears the error', () => {
    useWorkspaceStore.setState({ error: 'error' });
    useWorkspaceStore.getState().clearError();
    expect(useWorkspaceStore.getState().error).toBeNull();
  });

  it('setNotice sets notice and clearNotice clears it', () => {
    useWorkspaceStore.getState().setNotice('saved');
    expect(useWorkspaceStore.getState().notice).toBe('saved');
    
    useWorkspaceStore.getState().clearNotice();
    expect(useWorkspaceStore.getState().notice).toBeNull();
  });

  it('refreshSnapshot calls getDesktopApi().workspace.getSnapshot()', async () => {
    const mockSnapshot = { agents: [], groups: [], models: [], runtime: {} };
    const mockGetSnapshot = vi.fn().mockResolvedValue(mockSnapshot);
    
    // Update mock for this test
    (getDesktopApi as any).mockReturnValue({
      workspace: { getSnapshot: mockGetSnapshot },
    });

    // Start refresh
    const promise = useWorkspaceStore.getState().refreshSnapshot();
    
    // Because snapshot was null, loading should be true
    expect(useWorkspaceStore.getState().loading).toBe(true);
    
    await promise;
    
    expect(mockGetSnapshot).toHaveBeenCalled();
    const state = useWorkspaceStore.getState();
    expect(state.snapshot).toEqual(mockSnapshot);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('refreshSnapshot handles errors', async () => {
    const mockGetSnapshot = vi.fn().mockRejectedValue(new Error('API failure'));
    
    (getDesktopApi as any).mockReturnValue({
      workspace: { getSnapshot: mockGetSnapshot },
    });

    await useWorkspaceStore.getState().refreshSnapshot();
    
    const state = useWorkspaceStore.getState();
    expect(state.error).toBe('API failure');
    expect(state.loading).toBe(false);
  });
});
