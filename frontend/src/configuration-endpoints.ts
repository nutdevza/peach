/* The settings page endpoint. The first-screen fetch and the mount-status block's refresh read the same one; each of the two bundles packages its own copy of this module. */
export const CONFIGURATION_URL = '/api/configuration';

/** Makes the machine running Peach pop the system folder dialog; a browser alone cannot obtain local absolute paths. */
export const PICK_FOLDER_URL = '/api/pick-folder';
