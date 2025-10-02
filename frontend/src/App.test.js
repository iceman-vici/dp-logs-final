import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Dialpad Calls Log System header', () => {
  render(<App />);
  const linkElement = screen.getByText(/Dialpad Calls Log System/i);
  expect(linkElement).toBeInTheDocument();
});