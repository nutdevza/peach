import { describe, expect, it, vi } from 'vitest';
import { CodeBlock } from '../../src/react/components/code-block';
import { buttonNamed, click, mount, settle } from './render';

describe('Read-only code block', () => {
  it('Display plain text and copy the full original, including truncated content', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const code = '<script>not executed</script>\n"long text"';
    const host = await mount(<CodeBlock code={code} language="json" label="Test code" maxCharacters={12} />);
    expect(host.querySelector('pre')?.textContent).toBe(code.slice(0, 12));
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('pre')?.tabIndex).toBe(0);
    await click(buttonNamed('Copy full text', host));
    await settle();
    expect(writeText).toHaveBeenCalledWith(code);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Copied');
  });

  it('When the clipboard is denied, keep the selectable original and a retry button', async () => {
    const writeText = vi.fn(async () => { throw new Error('blocked') });
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const host = await mount(<CodeBlock code={'a = "b"'} language="toml" label="Configuration code" />);
    await click(buttonNamed('Copy code', host));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Copy failed');
    expect(host.querySelector('code')?.textContent).toBe('a = "b"');
    expect(buttonNamed('Copy code', host)).not.toBeNull();
  });
});
