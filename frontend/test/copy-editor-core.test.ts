import { describe, expect, it } from 'vitest';
import '../src/copy-editor-core.js';

const core = (globalThis as unknown as { PeachCopyEditorCore: {
  readJson(response: Response): Promise<unknown>;
  resolveDraft(edits: Record<string, string> | null, original: string): string;
  applyDrafts(root: Node, edits: Record<string, string>, originals: WeakMap<Node, string>, skip?: string): void;
} }).PeachCopyEditorCore;

describe('In-place text edit core', () => {
  it('Reads the JSON success result and the server\'s failure reason', async () => {
    await expect(core.readJson(new Response('{"ok":true,"text":""}'))).resolves.toEqual({ ok: true, text: '' });
    await expect(core.readJson(new Response('{"error":"save failed"}', { status: 500 }))).rejects.toThrow('Save failed');
  });
  it('A success response without JSON keeps the unconfirmed state', async () => {
    await expect(core.readJson(new Response(''))).rejects.toMatchObject({ unconfirmed: true });
    await expect(core.readJson(new Response('<html>error</html>', { status: 502 }))).rejects.toMatchObject({ unconfirmed: false });
    await expect(core.readJson(new Response('null'))).rejects.toMatchObject({ unconfirmed: true });
  });
  it('Continuous edits, deletions, and cyclic mappings all terminate', () => {
    expect(core.resolveDraft({ 甲: 'Beta', 乙: 'Alpha' }, 'Alpha')).toBe('');
    expect(core.resolveDraft({ 甲: 'Beta', 乙: 'Alpha' }, 'Alpha')).toBe('Alpha');
    expect(core.resolveDraft(null, 'Alpha')).toBe('Alpha');
  });
  it('Deleting a draft keeps text node identity and skips the editor and scripts', () => {
    const root = document.createElement('main');
    root.innerHTML = '<p>  Description  </p><script>Description</script><span data-copy-editor>Description</span>';
    const node = root.querySelector('p')!.firstChild!;
    const originals = new WeakMap<Node, string>();
    core.applyDrafts(root, { 说明: '' }, originals);
    expect(node.textContent).toBe('  Description  ');
    expect(root.querySelector('p')!.firstChild).toBe(node);
    expect(root.querySelector('script')!.textContent).toBe('Description');
    expect(root.querySelector('span')!.textContent).toBe('Note');
    core.applyDrafts(root, { 说明: '' }, originals);
    expect(node.textContent).toBe('    ');
    core.applyDrafts(root, { 说明: 'Restore' }, originals);
    expect(node.textContent).toBe('  Restore  ');
  });
});
