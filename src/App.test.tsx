import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Tenebris game title', () => {
  render(<App />);
  const titleElement = screen.getByText(/TENEBRIS/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders game subtitle', () => {
  render(<App />);
  const subtitleElement = screen.getByText(/A Strategic Social Experiment/i);
  expect(subtitleElement).toBeInTheDocument();
});

test('renders trust or fear text', () => {
  render(<App />);
  const trustFearElement = screen.getByText(/Trust or Fear\?/i);
  expect(trustFearElement).toBeInTheDocument();
});
