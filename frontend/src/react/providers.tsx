/* The three layers outside every React root: the shared QueryClient, Motion's reduced motion, and the popover container.
 *
 * The route tree's root (`router/router.tsx`) wraps this; pages, in-page components, and resident components (the stage included) all render inside this tree: the two
 * details in the stage and the catalog grid read the same cache, so when clicking from the list into details the card is already cached. */
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { UNSAFE_PortalProvider } from 'react-aria';

import { queryClient } from './query';

/* Popovers are rendered by React Aria outside the mount container. Landing on `body` puts them outside `.peach-react`'s
 * scope: tokens read `board.css` values, and Preflight no longer reaches them. Popovers of all React roots go into
 * the one `.peach-react`-bearing container at the end of `body`. */
let overlays: HTMLElement | null = null;
function overlayContainer(): HTMLElement {
  if (!overlays?.isConnected) {
    overlays = document.createElement('div');
    overlays.className = 'peach-react';
    overlays.dataset.reactOverlays = '';
    document.body.append(overlays);
  }
  return overlays;
}

/* All React roots share one QueryClient (ADR-0031): first screens written by page-level `prefetch` are read directly by
 * components on mount, and the same data never fetches once per root it happens to hang on.
 *
 * EvilCharts' grow-in animation is frame-driven by Motion, which the global reduced-motion rule in `web/css/01-base.css`
 * cannot reach, since it only stops CSS transitions. `MotionConfig reducedMotion="user"` catches it in one place at the root:
 * with the system's reduce-motion set, every Motion animation in every React root renders straight to its final state. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <UNSAFE_PortalProvider getContainer={overlayContainer}>{children}</UNSAFE_PortalProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
