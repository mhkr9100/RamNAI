import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismProfilePanel } from '../PrismProfilePanel';
import type { PrismProviderOverrideSettings, ProviderModelPreset } from '@supreme/shared';

const mockModels: ProviderModelPreset[] = [
  { id: 'qwen2.5-coder:3b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 3B', recommended: false },
  { id: 'qwen2.5-coder:7b', provider: 'ollama', installed: true, label: 'Qwen 2.5 Coder 7B', recommended: true },
  { id: 'gpt-4o', provider: 'openai', installed: false, label: 'GPT-4o', recommended: true },
];

const mockOverride: PrismProviderOverrideSettings = {
  provider: 'ollama',
  modelId: 'qwen2.5-coder:3b',
};

describe('PrismProfilePanel', () => {
  const onClose = vi.fn();
  const onSavePrismOverride = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <PrismProfilePanel
        open={false}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders Prism identity when open', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Prism')).toBeInTheDocument();
    expect(screen.getByText('META ARCHITECT')).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Prism capabilities', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('Prism Profile')).toBeInTheDocument();
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM INSTRUCTIONS')).toBeInTheDocument();
  });

  it('displays model routing section', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('MODEL ROUTING')).toBeInTheDocument();
  });

  it('shows channels section with loading or empty state', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={false}
      />,
    );
    expect(screen.getByText('CHANNELS')).toBeInTheDocument();
  });

  it('save button is disabled when busy', () => {
    render(
      <PrismProfilePanel
        open={true}
        onClose={onClose}
        prismOverride={mockOverride}
        models={mockModels}
        onSavePrismOverride={onSavePrismOverride}
        busy={true}
      />,
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });
});
