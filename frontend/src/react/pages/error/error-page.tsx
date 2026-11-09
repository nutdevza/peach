/* Error page: what people see when a browser-opened address hits an HTTP error.
 *
 * The server gives only the status code (`data-status`) and a detail already localized (`data-detail`); the title comes from the status code, 404 shows no
 * detail, and the button returns home. The tab title follows the heading. */
import { useEffect } from 'react';

import { ButtonLink } from '@/components/base/buttons/button';

import { AuthCard } from '../auth-card';
import type { PageData } from '../page-data';

const TITLES: Readonly<Record<string, string>> = {
  403: 'Cannot open here',
  404: '404',
  409: 'Can\'t do that right now',
};

export function errorTitle(status: string | undefined): string {
  return TITLES[status ?? ''] ?? 'Something went wrong';
}

export function ErrorPage({ data }: { data: PageData }) {
  const title = errorTitle(data.status);
  useEffect(() => {
    document.title = `Peach · ${title}`;
  }, [title]);
  return (
    <AuthCard title={title} lede={data.status === '404' ? undefined : data.detail}>
      <ButtonLink href="/" className="self-start">Back to home</ButtonLink>
    </AuthCard>
  );
}
