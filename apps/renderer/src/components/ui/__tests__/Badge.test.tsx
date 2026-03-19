import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders all variants', () => {
    const variants = ['default', 'brand', 'success', 'warning', 'error', 'info', 'outline'] as const;
    const { unmount } = render(
      <>
        {variants.map((v) => (
          <Badge key={v} variant={v}>{v}</Badge>
        ))}
      </>
    );
    variants.forEach((v) => {
      expect(screen.getByText(v)).toBeInTheDocument();
    });
    unmount();
  });

  it('shows dot element when dot prop is true', () => {
    const { container } = render(<Badge dot>With Dot</Badge>);
    // The relative flex container for the dot
    const dotContainer = container.querySelector('.relative.flex.h-1\\.5');
    expect(dotContainer).toBeInTheDocument();
  });

  it('adds ping animation when pulse prop is true', () => {
    const { container } = render(<Badge dot pulse>Pulsing Dot</Badge>);
    const pingElement = container.querySelector('.animate-ping');
    expect(pingElement).toBeInTheDocument();
  });
});
