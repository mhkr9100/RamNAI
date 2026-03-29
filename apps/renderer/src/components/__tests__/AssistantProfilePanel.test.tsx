import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantProfilePanel } from '../AssistantProfilePanel';
import type { AssistantProviderOverrideSettings, ProviderModelPreset } from '@raman-ai/shared';

const mockModels: ProviderModelPreset[] = [
  { id: 'qwen2.5-coder:3b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 3B', recommended: false },
  { id: 'qwen2.5-coder:7b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 7B', recommended: true },
  { id: 'gpt-4o', provider: 'openai', installed: false, label: 'GPT-4o', recommended: true },
];

const mockOverride: AssistantProviderOverrideSettings = {
  provider: 'ollama',
  modelId: 'qwen2.5-coder:3b',
};

describe('AssistantProfilePanel', () => {
  const onClose = vi.fn();
  const onSaveAssistantOverride = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <AssistantProfilePanel
        open={false}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders Raman AI identity when open', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Raman AI')).toBeInTheDocument();
    expect(screen.getByText('PRIMARY SYSTEM')).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Raman AI capabilities', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Raman AI Profile')).toBeInTheDocument();
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM INSTRUCTIONS')).toBeInTheDocument();
  });

  it('displays model routing section', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
  });

  it('shows channels section with loading or empty state', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('CHANNELS')).toBeInTheDocument();
  });

  it('save button is disabled when busy', () => {
    render(
      <AssistantProfilePanel
        open={true}
        onClose={onClose}
        assistantOverride={mockOverride}
        models={mockModels}
        onSaveAssistantOverride={onSaveAssistantOverride}
        busy={true}
      />,
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });
});
