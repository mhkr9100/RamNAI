import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Badge } from '../Badge';
import { Card } from '../Card';

describe('Accessibility tests', () => {
  it('Button has accessible name', () => {
    render(<Button>Submit Form</Button>);
    expect(screen.getByRole('button', { name: 'Submit Form' })).toBeInTheDocument();
  });

  it('Input has accessible label', () => {
    render(<Input label="Username" id="username" />);
    // The label text is "Username"
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('Input displays focus ring classes for visible focus', () => {
    const { container } = render(<Input label="Email" />);
    const input = container.querySelector('input');
    
    // Check for our specific focus classes from tailwind
    expect(input).toHaveClass('focus:ring-2');
  });

  it('Button displays focus ring classes for visible focus', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button');
    
    // Check for focus visible outline classes
    expect(button).toHaveClass('focus-visible:ring-2');
  });

  it('Badge renders valid HTML (span by default)', () => {
    const { container } = render(<Badge>New</Badge>);
    // First element should be a span
    expect(container.firstChild?.nodeName.toLowerCase()).toBe('span');
  });

  it('Card renders valid HTML (div by default) without structural issues', () => {
    const { container } = render(
      <Card>
        <div>Content</div>
      </Card>
    );
    expect(container.firstChild?.nodeName.toLowerCase()).toBe('div');
    expect(container.textContent).toContain('Content');
  });
});
