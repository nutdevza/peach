/* The `data-*` attributes on the HTML template mount: keys are the camelCase names after dropping the `data-` prefix, values are all strings, and keys the server did not send are absent. */
export type PageData = Readonly<Record<string, string | undefined>>;
