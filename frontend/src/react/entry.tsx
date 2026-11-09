/* Resident component config interfaces inside the main UI; type contracts in `bundle.d.ts`.
 * Pages and resident components are painted by Application's single route tree; the Toaster's independent root is cleaned up by the app lifecycle.
 * Shared cache, reduced motion, and popover container: see `providers.tsx`. */
import './styles.css';

export { configureBatchDock } from './batch-dock/batch-dock-island';
export { configureGlowPicker } from './glow-picker/glow-picker-island';
export { configureImmerse } from './immerse/immerse-island';
export { configureManageHeader } from './manage-header/manage-header-island';
export { prefetchManagedRoute } from './router/managed-routes';
export { configureSettingsPanel } from './settings-panel/settings-panel';
export { configureSidebar } from './sidebar/sidebar-island';
export { configureStage } from './stage/stage';
export { mountToaster, showToast } from './toaster';
