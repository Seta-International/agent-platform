import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichTextDisplay } from '../../../src/rich-text/RichTextDisplay';

describe('RichTextDisplay', () => {
  it('renders plain text via ReactMarkdown (no dangerouslySetInnerHTML)', () => {
    const { container } = render(<RichTextDisplay value="hello world" />);
    // ReactMarkdown produces a <p> wrapper, not a raw div with dangerouslySetInnerHTML
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe('hello world');
    // The root element must NOT have dangerouslySetInnerHTML attribute signature
    // (the div[data-rich-text] sentinel is set only in HTML mode)
    expect(container.querySelector('[data-rich-text="html"]')).toBeNull();
  });

  it('renders HTML content via dangerouslySetInnerHTML', () => {
    const { container } = render(<RichTextDisplay value="<p>Hello <strong>world</strong></p>" />);
    expect(container.querySelector('[data-rich-text="html"]')).not.toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('strips <script> tags from HTML content before rendering', () => {
    const { container } = render(<RichTextDisplay value="<p>safe</p><script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('safe');
  });

  it('treats text with angle-bracket words (non-HTML) as plain text', () => {
    const { container } = render(<RichTextDisplay value="contact <user@example.com> for help" />);
    // Should route through ReactMarkdown, not HTML path
    expect(container.querySelector('[data-rich-text="html"]')).toBeNull();
    expect(container.textContent).toContain('user@example.com');
  });

  it('renders nothing for null value', () => {
    const { container } = render(<RichTextDisplay value={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for undefined value', () => {
    const { container } = render(<RichTextDisplay value={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
