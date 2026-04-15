import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ImagePreview } from './ImagePreview';

describe('ImagePreview', () => {
  it('renders an img with contain sizing', () => {
    const { container } = render(<ImagePreview url="x.png" alt="x" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('object-contain');
    expect(img?.getAttribute('src')).toBe('x.png');
    expect(img?.getAttribute('alt')).toBe('x');
  });
});
