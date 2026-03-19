import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chat-store';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({ selectedTarget: null, draftSeed: null });
  });

  it('initial state has null selectedTarget and draftSeed', () => {
    const state = useChatStore.getState();
    expect(state.selectedTarget).toBeNull();
    expect(state.draftSeed).toBeNull();
  });

  it('selectTarget sets the selectedTarget', () => {
    useChatStore.getState().selectTarget({ type: 'agent', id: '123' });
    expect(useChatStore.getState().selectedTarget).toEqual({ type: 'agent', id: '123' });
  });

  it('clearTarget sets selectedTarget to null', () => {
    useChatStore.setState({ selectedTarget: { type: 'group', id: '456' } });
    useChatStore.getState().clearTarget();
    expect(useChatStore.getState().selectedTarget).toBeNull();
  });

  it('setDraftSeed sets a valid seed', () => {
    const seed = { target: { type: 'agent' as const, id: '123' }, token: 'abc', text: 'hello' };
    useChatStore.getState().setDraftSeed(seed);
    expect(useChatStore.getState().draftSeed).toEqual(seed);
  });

  it('clearDraftSeed resets draftSeed to null', () => {
    useChatStore.setState({ draftSeed: { target: { type: 'agent', id: '123' }, token: 'abc', text: 'hello' } });
    useChatStore.getState().clearDraftSeed();
    expect(useChatStore.getState().draftSeed).toBeNull();
  });

  it('selecting same target is a no-op', () => {
    const target = { type: 'agent' as const, id: '123' };
    useChatStore.setState({ selectedTarget: target });
    const state = useChatStore.getState();
    
    state.selectTarget({ type: 'agent', id: '123' });
    
    expect(useChatStore.getState()).toBe(state);
  });
});
