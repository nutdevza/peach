/* The media directory row: shared by the configuration page's "This computer" and the first-run page.
 *
 * One row is one outlined card: path box, "Choose folder", a remove key when there are several rows, then two rows of cells
 * each with a label above, meaning first: how this directory is read (source, read policy), then which media library it
 * displays as (belongs to, name; the configuration page adds an icon). Row add/remove, per-row errors, focus moving to a new
 * row and the choose-folder busy state belong to `useFolderRows`; the request that pops the system dialog is injected by the
 * caller, and this module knows no endpoints, so the first-run page's standalone bundle need not carry the main UI's request
 * wrapper. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RiDeleteBinLine } from '@remixicon/react';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';

import { IconButton } from '@/components/base/buttons/icon-button';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { Select, SelectItem } from '@/components/base/select/select';
import { cx } from '@/utils/cx';

import { ErrorText, Help, SourceMark } from './section';
import { busyProps } from './busy-props';
import { CLOUD_LOCATIONS, MEDIA_SOURCE_OPTIONS, type SourceCost } from '../../core/media-sources';

/** "Choose folder" opens the system dialog to pick, using the sprite's `folder-search` site-wide; `folder-open` belongs to "Open location",
 *  as Remix Icon has no such glyph. */
export function FolderSearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <use href="#i-folder-search" />
    </svg>
  );
}

export type SourceOption = readonly [kind: string, name: string];

export const MEDIA_SOURCES: readonly SourceOption[] = MEDIA_SOURCE_OPTIONS;

export const sourceMark = (location: string) => MEDIA_SOURCE_ICONS[location] || 'database';
export const isCloudSource = (location: string) => CLOUD_LOCATIONS.includes(location);

/** One cell in a row: a block label above, the control below. The label is for sighted users only; the control's accessible name comes from its own numbered
 *  `aria-label`, and the label text is part of it, so screen readers and voice control can still find it by the words on screen. */
export function FolderField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <Label elementType="span" aria-hidden>{label}</Label>
      {children}
    </div>
  );
}

/** A row of fields. Side by side when there is width, wrapping cell by cell when narrow; top aligned, the labels share one height so the controls line up too, and an extra error line under one cell only grows downward. */
export function FolderFieldLine({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-wrap items-start gap-2">{children}</div>;
}

export function MediaReadPolicy({ index, cost, error, onChange }: {
  index: number; cost: SourceCost | ''; error?: string; onChange(cost: SourceCost): void;
}) {
  return <div data-media-read-policy={index} className="flex w-full flex-col gap-1 @lg:w-32">
    <Label elementType="span" aria-hidden>Read policy</Label>
    <Select aria-label={`Media read policy ${index + 1}`} placeholder="Choose the read policy" isRequired
      validationBehavior="aria" isInvalid={Boolean(error)} selectedKey={cost || null}
      onSelectionChange={(key) => { if (key === 'free' || key === 'metered') onChange(key); }}>
      <SelectItem id="free">Normal reading</SelectItem>
      <SelectItem id="metered">Proxy protection</SelectItem>
    </Select>
    {error ? <ErrorText>{error}</ErrorText> : null}
  </div>;
}

export function MediaReadPolicyHelp() {
  return <Help>When the read strategy is set to "Proxy protection", automatic video reads are restricted.</Help>;
}

export interface FolderRowValue { path: string; location: string }

/** Row state. `pickFolder` starts the dialog at the current path and returns the chosen path, or null on cancel;
 *  a thrown failure goes through `describe` into the sentence written under that row. */
export function useFolderRows<T extends FolderRowValue>({ initial, blank, pickFolder, describe, focusAfterPick = false }: {
  initial: () => T[];
  blank: () => T;
  pickFolder: (initial: string) => Promise<string | null>;
  describe: (cause: unknown) => string;
  /** After picking, focus returns to this row's path field (first-run page); the config page keeps focus on the chooser button. */
  focusAfterPick?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const pickingNow = useRef(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // The newly added row takes focus right away: after adding, the next step is always typing a path into it.
  useLayoutEffect(() => {
    if (focusRow === null) return;
    inputs.current[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const edit = (index: number, patch: Partial<T>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const setRowError = (index: number, message: string) => setErrors((list) => {
    const next = [...list];
    while (next.length <= index) next.push('');
    next[index] = message;
    return next;
  });
  const add = () => {
    setFocusRow(rows.length);
    setRows((list) => [...list, blank()]);
  };
  const remove = (index: number) => {
    setRows((list) => list.filter((_, i) => i !== index));
    setErrors((list) => list.filter((_, i) => i !== index));
  };

  // While the dialog is open, this row's select button is busy; canceling changes nothing, and when it cannot open the reason is written under this row.
  const pick = async (index: number) => {
    if (pickingNow.current) return;
    pickingNow.current = true;
    setPicking(index);
    try {
      const path = await pickFolder(rows[index]?.path ?? '');
      if (path) {
        edit(index, { path } as Partial<T>);
        setRowError(index, '');
      }
      if (focusAfterPick) setFocusRow(index);
    } catch (cause) {
      setRowError(index, describe(cause));
    } finally {
      pickingNow.current = false;
      setPicking(null);
    }
  };

  const inputRef = (index: number) => (element: HTMLInputElement | null) => { inputs.current[index] = element; };
  return { rows, edit, add, remove, errors, setErrors, picking, pick, inputRef };
}

/** One outlined row card. `label` is the path box's accessible name, `children` lay into the cell below the path. `error` goes verbatim into the notice under the path box;
 *  the caller can pass a node with `role="alert"` for screen reader announcement. `status` sits right of the path box;
 *  the config page uses it to mark whether the folder is online right now. */
export function FolderRow({ label, path, onPath, error, inputRef, picking, onPick, onRemove, status, children }: {
  label: string;
  path: string;
  onPath: (path: string) => void;
  error?: ReactNode;
  inputRef: (element: HTMLInputElement | null) => void;
  picking: boolean;
  onPick: () => void;
  onRemove?: () => void;
  status?: ReactNode;
  children: ReactNode;
}) {
  /* Folders in a group often share a long prefix, and showing the head in a narrow box makes every line the same segment; show the tail while not editing,
     so one can tell which folder it is. The full text lives in the title. */
  const box = useRef<HTMLInputElement | null>(null);
  const showTail = () => {
    const input = box.current;
    if (input && input.ownerDocument.activeElement !== input) input.scrollLeft = input.scrollWidth;
  };
  useLayoutEffect(() => {
    if (box.current) box.current.title = path;
    showTail();
  }, [path]);
  const attach = (element: HTMLInputElement | null) => {
    box.current = element;
    inputRef(element);
  };
  return (
    <div data-folder-row className="@container flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3">
      <div className="flex items-start gap-2">
        <Input className="min-w-0 flex-1" aria-label={label} placeholder="Media folder path"
          value={path} onChange={onPath} ref={attach}
          onBlur={() => requestAnimationFrame(showTail)}
          validationBehavior="aria" isInvalid={Boolean(error)} hint={error || undefined} />
        {status ? <div className="flex h-9 shrink-0 items-center">{status}</div> : null}
        <IconButton icon={FolderSearchIcon} aria-label="Select folder" onClick={onPick} {...busyProps(picking)} />
        {onRemove ? <Button variant="danger" iconOnly leadingIcon={RiDeleteBinLine} aria-label="Remove this folder" onClick={onRemove} /> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {children}
      </div>
    </div>
  );
}

/** Media source select, each item with a site badge; local disk uses the sprite's `hard-drive`. Labeled "Source" above,
 * with the accessible name provided by a numbered `aria-label`. */
export function SourceSelect({ index, value, onChange, options = MEDIA_SOURCES }: {
  index: number;
  value: string;
  onChange: (location: string) => void;
  options?: readonly SourceOption[];
}) {
  return (
    <FolderField label="Source" className="w-full @lg:w-60">
      <Select className="w-full" aria-label={`Media source ${index + 1}`} selectedKey={value}
        onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
        {options.map(([kind, name]) => (
          <SelectItem key={kind} id={kind} textValue={name}><SourceMark mark={sourceMark(kind)} />{name}</SelectItem>
        ))}
      </Select>
    </FolderField>
  );
}
