import type { ComponentProps } from 'react';

/** BoardUI link slots use Peach's native addresses; in-page navigation is taken over by the caller. */
export default function BoardNavigationLink(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
