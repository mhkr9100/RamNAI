import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../Input';
import { Search } from 'lucide-react';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('shows error message when error state is present', () => {
    render(<Input label="Email" error="Invalid email address" />);
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveClass('border-[#f87171]/40');
  });

  it('shows hint text', () => {
    render(<Input label="Password" hint="Must be at least 8 characters" />);
    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
  });

  it('renders icon in the input', () => {
    const { container } = render(<Input icon={<Search data-testid="search-icon" />} />);
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  it('fires onChange event', () => {
    const handleChange = vi.fn();
    render(<Input label="Search" onChange={handleChange} />);
    const input = screen.getByLabelText(/search/i);
    fireEvent.change(input, { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });
});
