import { describe, it, expect, beforeEach } from 'vitest';
import { useNavigationStore } from '../navigation-store';

describe('useNavigationStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useNavigationStore.setState({ activeView: 'prism' });
  });

  it('has initial state activeView = "prism"', () => {
    const { activeView } = useNavigationStore.getState();
    expect(activeView).toBe('prism');
  });

  it('changes activeView on navigate("chats")', () => {
    useNavigationStore.getState().navigate('chats');
    expect(useNavigationStore.getState().activeView).toBe('chats');
  });

  it('is a no-op when navigating to the same view', () => {
    useNavigationStore.setState({ activeView: 'chats' });
    const initialState = useNavigationStore.getState();
    
    initialState.navigate('chats');
    
    // Object reference should remain the same (no-op)
    expect(useNavigationStore.getState()).toBe(initialState);
  });

  it('allows navigating to all valid ViewId values', () => {
    const views = ['prism', 'chats', 'spectrum', 'work', 'usermap', 'settings'] as const;
    
    for (const view of views) {
      useNavigationStore.getState().navigate(view);
      expect(useNavigationStore.getState().activeView).toBe(view);
    }
  });
});
