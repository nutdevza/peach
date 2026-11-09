/* The CloudDrive starter configuration when a media source is set to a cloud drive.
 *
 * The page keeps only what to fill, how much, and how to confirm; the three caches' division of labor, conversion, and the starter values' origin live in
 * `docs/CLOUDDRIVE.md`, linked from here, so the same paragraph is not maintained twice. */
import { Disclosure, ExternalLink, Help } from './section';

export const CLOUDDRIVE_PROFILES = [
  { name: 'Hard disk drive, or up to 8 GB memory', cache: '10–20 GiB', read: '256 / 128 KB', task: '1 item' },
  { name: 'SATA SSD with 8-16 GB memory', cache: '20–50 GiB', read: '256 / 128 KB', task: '1–2 items' },
  { name: 'NVMe SSD with 16 GB+ memory', cache: '50–100 GiB', read: '256 / 128 KB', task: 'Minimum 2' },
] as const;

const READINGS = [['cache', 'Cache cap'], ['read', 'Read length (default / min)'], ['task', 'Process videos too']] as const;

export function CloudDriveGuide() {
  return (
    <div className="@container flex flex-col gap-3">
      <Disclosure summary="CloudDrive setup help">
        <Help>
          First mount the cloud drive from CloudDrive2 or OpenList as a local folder, then choose it here.
          <ExternalLink href="https://www.clouddrive2.com/help.html">Mount help</ExternalLink>
        </Help>
        <Help>The cache picks its starting value from the hosting disk and free memory, then adjusts to playback behavior.</Help>
        <Help>File operations need the mount tool and write permission granted by the cloud drive account. Uploading, creating folders, renaming, and moving on the Guangya cloud drive require CloudDrive2 v1.1.0 or later; deletion and copy are not supported yet.</Help>
        {/* The three tiers share one shape for cross-tier comparison: stacked blocks at narrow widths, three aligned columns of readings when wide. */}
        <ul aria-label="Tiered by cache disk" className="flex flex-col gap-2">
          {CLOUDDRIVE_PROFILES.map((profile) => (
            <li key={profile.name} className="flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3">
              <p className="text-body-medium text-text-primary">{profile.name}</p>
              <dl className="inline-grid grid-cols-1 gap-2 @md:grid-cols-3">
                {READINGS.map(([key, term]) => (
                  <div key={key} className="flex flex-col">
                    <dt className="text-caption-1-regular text-text-secondary">{term}</dt>
                    <dd className="text-body-regular text-text-primary">{profile[key]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-2-regular text-text-secondary">
          <li>Fill in the cache limit and cleanup mode under CloudDrive "Settings", choosing LRU for cleanup. Do not set the limit to 0, and leave at least 40 GiB on the system disk; reopen the settings page after filling it in to confirm it persisted.</li>
          <li>Read length and download threads go in each cloud drive's own download settings, with threads starting at 2.</li>
          <li>Buffer Cache uses memory; disk cache and folder cache use disk; changing one does not govern the other two.</li>
        </ul>
        <Help>
          <ExternalLink href="https://github.com/peach-mitao/peach/blob/master/docs/CLOUDDRIVE.md">Full configuration and tuning guide</ExternalLink>
        </Help>
      </Disclosure>
    </div>
  );
}
