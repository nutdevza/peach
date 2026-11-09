/* Media library icon: the trigger shows the current glyph, and opening reveals a single-select panel of a seven-column grid
 * that commits on "Apply".
 *
 * The registry has no grid single-select popup panel, so React Aria's `Popover`, `Dialog` and `RadioGroup` are composed, with
 * the panel look from BoardUI's `menu-styles.ts`. The value is a glyph name from the sprite, validated by the server per
 * `peach.media_libraries.LIBRARY_ICONS`. */
import { useRef, useState } from 'react';
import { Dialog, Heading, Popover, Radio, RadioGroup } from 'react-aria-components';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import { MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';

import { SourceMark } from './section';

/* Seven per row, six rows in all. The first is "no override": cloud drive libraries automatically use the cloud drive glyph, and local paths have no recognizable
   source, so they get the default disk. The rest group by theme: body and desire, identity and dress, scenes and situations, media and archives. */
export const LIBRARY_ICON_CHOICES = [
  ['', 'Auto-detect'], ['hard-drive', 'Disk'], ['database', 'Profile library'], ['heart', 'Crush'], ['heart-hand', 'Intimate'], ['flame', 'Passionate'], ['cherry', 'Cherry'],
  ['lollipop', 'Sweetheart'], ['candy', 'Candy'], ['banana', 'Banana'], ['droplets', 'Wet'], ['venus', 'Female'], ['mars', 'Male'], ['venus-and-mars', 'Couple'],
  ['gem', 'Featured'], ['crown', 'Queen'], ['ribbon', 'Ribbon'], ['shirt', 'Uniform'], ['graduation-cap', 'Student'], ['stethoscope', 'Nurse'], ['glasses', 'Glasses'],
  ['footprints', 'Footprints'], ['hand', 'Hands'], ['flower', 'Flowers'], ['venetian-mask', 'Cosplay'], ['rabbit', 'Bunny girl'], ['paw-print', 'Animal ears'], ['dumbbell', 'Gym'],
  ['bed-double', 'Bedroom'], ['bath', 'Bathroom'], ['key-round', 'Private'], ['wine', 'Tipsy'], ['cigarette', 'Smoke'], ['moon', 'Night'], ['sparkles', 'Fantasy'],
  ['camera', 'Photobook'], ['video', 'Movie'], ['film', 'Movies'], ['image', 'Gallery'], ['gamepad-2', 'Game'], ['star', 'Favorites'], ['tags', 'Theme'],
] as const;

/** The glyph and label when nothing else is chosen: cloud drive libraries follow their source (site badges for 115 and PikPak); a local path has nothing recognizable and gets the default disk. */
export function libraryAutoChoice(kind: string): [string, string] {
  const mark = kind !== 'local' ? MEDIA_SOURCE_ICONS[kind] : '';
  return mark ? [mark, 'Auto-detect'] : ['hard-drive', 'Default'];
}

/** The value "no separate pick" takes in the radio group. It persists as an empty string, and React Aria treats an empty string radio value as nothing selected. */
const AUTO = 'auto';

export function LibraryIconPicker({ value, label, kind = 'local', onChange }: {
  value: string; label: string; kind?: string; onChange(value: string): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [autoMark, autoLabel] = libraryAutoChoice(kind);
  const nameOf = (key: string) => (key && LIBRARY_ICON_CHOICES.find(([choice]) => choice === key)?.[1]) || autoLabel;

  return (
    <>
      <Button ref={trigger} variant="secondary" className="self-start" aria-label={label} aria-haspopup="dialog"
        aria-expanded={open} onClick={() => { setDraft(value); setOpen(true); }}>
        <span data-icon-choice className="flex items-center gap-2"><SourceMark mark={value || autoMark} />{nameOf(value)}</span>
      </Button>
      <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen} placement="bottom start" offset={4}
        className={MENU_POPOVER_SURFACE}>
        <Dialog aria-label={`${label} icon options`} className="flex w-72 flex-col gap-3 outline-none">
          <Heading slot="title" className="px-1 text-body-medium text-text-primary">Select library icon</Heading>
          {/* Cells hold only icons, names go in aria-label: with visible text the 42 candidates would wrap onto a dozen rows. */}
          <RadioGroup aria-label="Optional marks" value={draft || AUTO} onChange={(next) => setDraft(next === AUTO ? '' : next)}
            className="inline-grid grid-cols-7 gap-1">
            {LIBRARY_ICON_CHOICES.map(([key, name]) => (
              <Radio key={key || AUTO} value={key || AUTO} aria-label={key ? name : autoLabel}
                className="flex h-10 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-secondary outline-none hover:bg-dropdown-item-hover-background focus-visible:ring-2 focus-visible:ring-border-focus-ring data-selected:bg-dropdown-item-hover-background data-selected:text-text-primary">
                <SourceMark mark={key || autoMark} />
              </Radio>
            ))}
          </RadioGroup>
          <div className="flex justify-end gap-2 border-t border-separator-border pt-2.5">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={draft === value} onClick={() => { onChange(draft); setOpen(false); }}>Apply</Button>
          </div>
        </Dialog>
      </Popover>
    </>
  );
}
