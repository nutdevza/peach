/* The standalone pages' outer frame: one outlined card centered on the page background, with the site mark, title and an
 * optional lead line in the card head.
 *
 * The registry has no Auth Card, so BoardUI tokens are composed, layered like the configuration page's settings sections: the
 * page takes `background-full` (applied to body by `pages.css`), the card face `background-secondary-default` plus a
 * `separator-border`; inputs and segments inside the card are tertiary, folder rows and secondary buttons primary, one tier
 * brighter than the card face in both themes. 24px radius, narrower padding on small screens.
 * While `busy`, the card carries `aria-busy` and the title has not returned yet. */
import type { ReactNode } from 'react';

export function AuthCard({ title, lede, busy = false, children }: {
  title: string;
  lede?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="flex justify-center px-6 py-12 max-sm:px-4 max-sm:py-6">
      <section aria-labelledby="auth-card-title" aria-busy={busy || undefined}
        className="flex w-full max-w-140 flex-col gap-6 rounded-3xl border border-separator-border bg-background-secondary-default p-8 max-sm:p-5">
        <header className="flex flex-col gap-1">
          <img src="/peach-logo-128.png" srcSet="/peach-logo-64.png 64w, /peach-logo-128.png 128w" sizes="40px"
            alt="" width={40} height={40} decoding="async" className="mb-4 size-10" />
          <h1 id="auth-card-title" className="text-title-2-medium text-text-primary">{title}</h1>
          {lede ? <p className="whitespace-pre-line text-body-2-regular text-text-secondary wrap-anywhere">{lede}</p> : null}
        </header>
        {children}
      </section>
    </main>
  );
}

/** A group inside the card: a separator on top and 24px padding. The first group follows the card header with no line. */
export function CardGroup({ first = false, labelledBy, children }: {
  first?: boolean;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy}
      className={first ? 'flex flex-col gap-4' : 'flex flex-col gap-4 border-t border-separator-border pt-6'}>
      {children}
    </section>
  );
}

/** The top-level group heading. */
export function GroupTitle({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="text-body-semibold text-text-primary">{children}</h2>;
}
