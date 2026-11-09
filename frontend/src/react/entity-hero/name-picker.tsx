/* The dropdown to the right of the name: pick one of this entity's existing spellings as the common name, or add a new one.
 *
 * The common name is the user's call. The same person is often in the library under Chinese, Japanese and romaji spellings,
 * and which one tops the title is a preference with no field in the database to derive it from. The menu groups existing
 * stage-name spellings by the name-language preference, excluding readings and corrupted entries. Switching the language
 * preference does not trigger the unify-name action. The dropdown is always present, even with a single name: "she has gone
 * by other names" needs an entry point, and precisely the people with only one name need it most. Adding an alias is a
 * separate matter, set apart at the end behind a divider.
 *
 * Changing the common name writes the truth field `entity.canonical_name`: confirm, write-back, receipt and re-entering the
 * page all happen in the shell (`actions.chooseName`), and the check only moves after the server has changed it and the page
 * re-rendered.
 *
 * The panel opens rightward from the button's left edge: opening leftward puts the 260px menu over the name and onto the
 * avatar (reported by a user). The panel's box takes BoardUI's menu surface (`MENU_POPOVER_SURFACE`, same as the legacy
 * anchored menu `.popmenu`'s 16px radius, 10px padding and shadow); menu item geometry lives in `./entity-hero.css`. */
import { useEffect, useRef, useState } from 'react';
import { Button, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from 'react-aria-components';

import { MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';

import { Glyph } from './glyph';

export function NamePicker({ current, choices, onChoose, onAddAlias }: {
  current: string;
  choices: { value: string; label: string }[];
  onChoose(name: string): void;
  onAddAlias(): void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  /* title is for the shell's tooltip (board-controls only recognizes [title]), showing text on hover like the old profile card's.
     react-aria's Button does not accept title, so it is written onto the node directly after mount; the tooltip puts it back when dismissed. */
  useEffect(() => { toggle.current?.setAttribute('title', 'Names and aliases') }, []);
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button ref={toggle} data-namepick-toggle="" aria-label="Names and aliases">
        <Glyph name="chevron-down" />
      </Button>
      {/* 8px off the button: the old anchored menu wireAnchoredMenu uses anchor.bottom + 8, and the other two popovers use 8 as well. */}
      <Popover placement="bottom start" offset={8} containerPadding={8} className={MENU_POPOVER_SURFACE}
        data-namepick-menu="">
        <Menu aria-label="Names and aliases" data-namepick-list="">
          <MenuSection selectionMode="single" disallowEmptySelection selectedKeys={[current]}
            onSelectionChange={(keys) => {
              const chosen = [...(keys as Set<string>)][0];
              if (chosen && chosen !== current) onChoose(chosen);
            }}>
            {choices.map((option) => (
              <MenuItem key={option.value} id={option.value} textValue={option.label} data-namepick-name={option.value}>
                <Glyph name="check" /><span>{option.label}</span>
              </MenuItem>
            ))}
          </MenuSection>
          <Separator data-namepick-rule="" />
          <MenuSection>
            <MenuItem id="alias" textValue="Add alias" data-namepick-alias="" onAction={onAddAlias}>
              <Glyph name="plus" /><span>Add alias…</span>
            </MenuItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
