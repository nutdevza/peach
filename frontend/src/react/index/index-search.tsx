import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { InputBase, TextField } from '@/components/base/input/input';
import { spriteGlyph } from '../components/sprite-glyph';
import { composingKey } from '../components/ime';

const SearchGlyph = spriteGlyph('search');

/* A read-only filter gets no submit button: stop typing 300ms and it searches; Enter means "stop waiting, search now". A CJK IME's composition
   also fires input, and filtering on unfixed pinyin filters on half-typed input like "zhon"; compositionend takes over after composition,
   and Enter during composition is committing the text, so it is let through. */
export function IndexSearch({ label, value, onQuery }: { label: string; value: string; onQuery(q: string): void }) {
  const [text, setText] = useState(value);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { clearTimeout(timer.current); setText(value) }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const later = (next: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onQuery(next.trim()), 300);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || composing.current || composingKey(event.nativeEvent)) return;
    event.preventDefault();
    clearTimeout(timer.current);
    onQuery(text.trim());
  };
  return (
    <div data-index-search="" className="ml-auto min-w-0 max-w-80 flex-1"
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => { composing.current = false; later((event.target as HTMLInputElement).value) }}>
      <TextField aria-label={label} value={text}
        onChange={(next) => { setText(next); if (!composing.current) later(next) }}>
        <InputBase type="search" leadingIcon={SearchGlyph} spellCheck={false} autoComplete="off" enterKeyHint="search"
          onKeyDown={onKeyDown} />
      </TextField>
    </div>
  );
}

