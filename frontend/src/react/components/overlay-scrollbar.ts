/* Components can bind the overlay scrollbar early; the site-wide incremental entry takes over any scroll area not explicitly bound. */
import { useEffect, useRef } from 'react';

import { attachOverlayScrollbar } from '@peach/legacy/ui';

/** Ref to the scrolling element. In plain content areas the track is a sibling of the container; a positioned overlay's track is carried by itself. */
export function useOverlayScrollbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const owned = useRef<{ node: T; control: ReturnType<typeof attachOverlayScrollbar> } | null>(null);
  /* Try on every render, with no dependency array: `attachOverlayScrollbar` carries its own "already attached" flag,
     and this block often only enters the DOM on the render where the content has landed. */
  useEffect(() => {
    if(owned.current?.node===ref.current)return;
    owned.current?.control?.destroy();
    owned.current=ref.current?{node:ref.current,control:attachOverlayScrollbar(ref.current)}:null;
  });
  useEffect(()=>()=>{owned.current?.control?.destroy();owned.current=null},[]);
  return ref;
}
