/* Managed-area body is centered at the `--board-content` width matching `max-w-board`; the page title is laid out independently by the page header. */
import type { ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-board flex-col gap-8">{children}</div>;
}
