import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('renders all variants without errors', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger', 'brand'] as const;
    const { unmount } = render(
      <>
        {variants.map((v) => (
          <Button key={v} variant={v}>{v}</Button>
        ))}
      </>
    );
    variants.forEach((v) => {
      expect(screen.getByText(v)).toBeInTheDocument();
    });
    unmount();
  });

  it('handles disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: /disabled/i })).toBeDisabled();
  });

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    // Assuming lucide-react LoaderCircle renders an svg with a specific class or we can find an svg with animate-spin
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('fires click handler', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies fullWidth class', () => {
    render(<Button fullWidth>Full</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });
});
