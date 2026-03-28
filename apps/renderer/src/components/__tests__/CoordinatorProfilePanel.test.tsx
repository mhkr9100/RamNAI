import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoordinatorProfilePanel } from '../CoordinatorProfilePanel';
import type { CoordinatorProviderOverrideSettings, ProviderModelPreset } from '@workspace/shared';

const mockModels: ProviderModelPreset[] = [
  { id: 'qwen2.5-coder:3b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 3B', recommended: false },
  { id: 'qwen2.5-coder:7b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 7B', recommended: true },
  { id: 'gpt-4o', provider: 'openai', installed: false, label: 'GPT-4o', recommended: true },
];

const mockOverride: CoordinatorProviderOverrideSettings = {
  provider: 'ollama',
  modelId: 'qwen2.5-coder:3b',
};

describe('CoordinatorProfilePanel', () => {
  const onClose = vi.fn();
  const onSaveCoordinatorOverride = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <CoordinatorProfilePanel
        open={false}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders Coordinator identity when open', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Coordinator')).toBeInTheDocument();
    expect(screen.getByText('META ARCHITECT')).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Coordinator capabilities', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Coordinator Profile')).toBeInTheDocument();
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM INSTRUCTIONS')).toBeInTheDocument();
  });

  it('displays model routing section', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
  });

  it('shows channels section with loading or empty state', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('CHANNELS')).toBeInTheDocument();
  });

  it('save button is disabled when busy', () => {
    render(
      <CoordinatorProfilePanel
        open={true}
        onClose={onClose}
        coordinatorOverride={mockOverride}
        models={mockModels}
        onSaveCoordinatorOverride={onSaveCoordinatorOverride}
        busy={true}
      />,
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });
});
