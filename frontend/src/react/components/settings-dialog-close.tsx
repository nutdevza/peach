import './settings-dialog-close.css';

/** The close control shared by settings popovers. */
export function SettingsDialogClose({ label, id, onPress }: { label: string; id?: string; onPress(): void }) {
  return <button type="button" id={id} data-settings-dialog-close="" aria-label={label} onClick={onPress}>
    <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#i-x" /></svg>
  </button>;
}
