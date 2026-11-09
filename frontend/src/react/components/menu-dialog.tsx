import { Dialog, type DialogProps } from 'react-aria-components';
import { useMovingSurface } from './use-moving-surface';

/** The hover surface of the short menu; gaps and disabled items do not map to other actions. */
export function MenuDialog(props: DialogProps) {
  const ref = useMovingSurface('hover');
  return <Dialog {...props} ref={ref} />;
}
