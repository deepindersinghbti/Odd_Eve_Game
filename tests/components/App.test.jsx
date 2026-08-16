import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '../../src/App.jsx';

describe('App', () => {
  it('renders the accessible Phase 0 application shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'HAND CRICKET' })).toBeVisible();
    expect(screen.getByText('You vs Computer')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Game setup coming next');
  });
});
