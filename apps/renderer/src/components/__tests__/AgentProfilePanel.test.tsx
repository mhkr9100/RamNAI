import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentProfilePanel } from '../AgentProfilePanel';
import type { AgentSpec } from '@supreme/shared';

const mockAgent: AgentSpec = {
  id: 'test-agent-1',
  slug: 'test-agent',
  name: 'Test Agent',
  description: 'A test agent for unit tests',
  createdBy: 'prism',
  originObjective: 'Test objective',
  persona: {
    role: 'AI Assistant',
    mission: 'Help with testing',
    systemInstructions: 'You are a helpful test agent.',
  },
  providerStrategy: {
    mode: 'local_first',
    preferredLocalModelIds: ['qwen2.5-coder:3b'],
    fallbackProviders: ['openai'],
  },
  tools: ['web_search', 'code_execution'],
  skills: ['thinking'],
  context: {
    userMapPaths: [],
    workspacePaths: [],
    memoryNamespaces: [],
    canReadArtifacts: true,
    canWriteArtifacts: false,
  },
  runtime: {
    supportsChat: true,
    supportsTask: true,
    supportsRecurringTask: false,
    supportsMentions: false,
    groupEligible: true,
    councilEligible: true,
  },
  safety: {
    allowExternalNetwork: true,
    allowFileWrites: false,
    allowShell: false,
    approvalMode: 'ask' as const,
  },
  metadata: {
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-18T00:00:00Z',
    version: 1,
    source: 'prism-create' as const,
  },
};

describe('AgentProfilePanel', () => {
  const onClose = vi.fn();
  const onOpenChat = vi.fn();
  const onUpdateProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <AgentProfilePanel agent={mockAgent} open={false} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when agent is null', () => {
    const { container } = render(
      <AgentProfilePanel agent={null} open={true} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders agent name when open with valid agent', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  it('renders agent role', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    expect(screen.getByText('AI ASSISTANT')).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows capabilities from tools and skills', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    expect(screen.getByText('WEB SEARCH')).toBeInTheDocument();
    expect(screen.getByText('CODE EXECUTION')).toBeInTheDocument();
    expect(screen.getByText('THINKING')).toBeInTheDocument();
  });

  it('shows system instructions', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    expect(screen.getByText('You are a helpful test agent.')).toBeInTheDocument();
  });

  it('shows Open Chat button when onOpenChat is provided', () => {
    render(
      <AgentProfilePanel
        agent={mockAgent}
        open={true}
        onClose={onClose}
        onOpenChat={onOpenChat}
      />,
    );
    const chatButton = screen.getByRole('button', { name: /open chat/i });
    expect(chatButton).toBeInTheDocument();
    fireEvent.click(chatButton);
    expect(onOpenChat).toHaveBeenCalledWith('test-agent-1');
  });

  it('shows UPDATE PROFILE button when onUpdateProfile is provided', () => {
    render(
      <AgentProfilePanel
        agent={mockAgent}
        open={true}
        onClose={onClose}
        onUpdateProfile={onUpdateProfile}
      />,
    );
    expect(screen.getByRole('button', { name: /update profile/i })).toBeInTheDocument();
  });

  it('shows provider strategy mode', () => {
    render(
      <AgentProfilePanel agent={mockAgent} open={true} onClose={onClose} />,
    );
    expect(screen.getByText('local first')).toBeInTheDocument();
  });
});
