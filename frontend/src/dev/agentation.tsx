/* The UI annotation tool Agentation's mount entry, built only by `vite.agentation.config.ts`.
 *
 * The output lands in `build/agentation/`, out of Git and out of the standalone bundle; Application imports
 * `import('/dev/agentation.js')` only when the current address explicitly enables it. It ships its own React, mounted on its
 * own root at the end of `<body>`, unrelated to the page's React subtree. Usage in docs/FRONTEND.md, "UI annotation". */
import { Agentation } from 'agentation';
import { createRoot } from 'react-dom/client';

import { identifyAgentationFields } from './agentation-fields';

/** The HTTP port of the local `agentation-mcp`. While the service is down the annotation still lands in the browser and is backfilled automatically once it is up. */
const ENDPOINT = 'http://localhost:4747';

const host = document.createElement('div');
host.dataset.agentation = '';
identifyAgentationFields(host);
document.body.append(host);
// Peach holds the global shortcuts itself (Esc collapses the panel, arrow keys flip images), so the annotation tool works only through toolbar buttons.
createRoot(host).render(
  <Agentation appName="Peach" endpoint={ENDPOINT} portalContainer={host} enableKeyboardShortcuts={false} />,
);
