/* This machine's media processing preferences; two cards read and write the same `['media-processing']` key:
 * - "Video preview" ("Library and import"): the master switch for generating 9-grid and timeline previews of local videos,
 *   the timeline tier and the frame-extraction decode method. The master switch first, tiers depending on it next, the rarely
 *   changed decode method last.
 * - "Video playback" ("App and maintenance"): the codecs for full-file and HLS transcoding during playback. It governs this
 *   computer's hardware, belongs with autostart under local runtime, and stays out of the settings overlay's UI preferences
 *   (ADR-0103). */
import { useQuery } from '@tanstack/react-query';
import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Switch } from '@/components/base/switch/switch';
import { Select, SelectItem } from '@/components/base/select/select';

import { apiSend, errorMessage } from '../../api';
import { queryClient } from '../query';
import {
  MEDIA_PROCESSING_KEY, MEDIA_PROCESSING_URL, THUMBNAIL_JOBS_KEY, fetchMediaProcessing, type MediaProcessingPolicy,
} from '../settings-panel/settings-data';
import { LIBRARY_PROCESSING_KEY } from '../library-processing/library-processing';
import { ErrorText, Help, Rows, Section, Stack } from './section';
import { useAction } from './use-action';
import { VideoThumbnailControls } from './service-preferences';

export function MediaProcessingSettings({ receipt }: { receipt(message: string): void }) {
  const policy = useQuery({ queryKey: MEDIA_PROCESSING_KEY, queryFn: ({ signal }) => fetchMediaProcessing(signal) });
  const action = useAction();
  const error = action.error || (policy.error ? errorMessage(policy.error) : '');
  const blocked = !policy.data || policy.isFetching || !!action.busy;
  return (
    <Section guide="preview" title="Video previews">
      <Rows>
        <SettingsRow label="Generate video previews" description="Generates the nine-grid and timeline previews for local videos.">
          <Switch aria-label="Generate video previews" isSelected={!!policy.data && !policy.data.metadata_only} isDisabled={blocked}
            onChange={(value) => void action.run('save', (signal) =>
              apiSend<MediaProcessingPolicy>(MEDIA_PROCESSING_URL, { metadata_only: !value }, 'POST', signal), (saved) => {
                queryClient.setQueryData(MEDIA_PROCESSING_KEY, saved);
                void queryClient.invalidateQueries({ queryKey: THUMBNAIL_JOBS_KEY });
                void queryClient.invalidateQueries({ queryKey: LIBRARY_PROCESSING_KEY });
                receipt(saved.metadata_only ? 'Video preview generation disabled' : 'Video preview generation enabled');
              })} />
        </SettingsRow>
      </Rows>
      <VideoThumbnailControls disabled={!policy.data || policy.data.metadata_only || !!action.busy} />
      <Rows>
        <SettingsRow label="Frame extraction decoder" description="Used to generate covers, contact sheets, and timelines.">
          <div id="previewAccelerationSetting">
            <Select aria-label="Frame extraction decoder" selectedKey={policy.data?.preview_acceleration || 'auto'} isDisabled={blocked}
              onSelectionChange={(mode) => {
                if (mode === null) return;
                void action.run('preview_acceleration', (signal) => apiSend<MediaProcessingPolicy>(MEDIA_PROCESSING_URL,
                  { preview_acceleration: String(mode) }, 'POST', signal), (saved) => {
                  queryClient.setQueryData(MEDIA_PROCESSING_KEY, saved);
                  receipt('Frame extraction decoder saved');
                });
              }}>
              <SelectItem id="auto">Automatic (hardware first)</SelectItem>
              <SelectItem id="software">Software decode</SelectItem>
            </Select>
          </div>
        </SettingsRow>
      </Rows>
      {action.busy ? <Stack divided><Help role="status">Saving…</Help></Stack> : null}
      {error ? <Stack divided><ErrorText>{error}</ErrorText></Stack> : null}
    </Section>
  );
}

export function PlaybackTranscodeSettings({ receipt }: { receipt(message: string): void }) {
  const policy = useQuery({ queryKey: MEDIA_PROCESSING_KEY, queryFn: ({ signal }) => fetchMediaProcessing(signal) });
  const action = useAction();
  const error = action.error || (policy.error ? errorMessage(policy.error) : '');
  return (
    <Section guide="transcode" title="Video playback">
      <Rows>
        <SettingsRow label="Transcode method" description="Used for video transcoding during playback.">
          <div id="playbackAccelerationSetting">
            <Select aria-label="Transcode method" selectedKey={policy.data?.playback_acceleration || 'auto'}
              isDisabled={!policy.data || policy.isFetching || !!action.busy}
              onSelectionChange={(mode) => {
                if (mode === null) return;
                void action.run('playback_acceleration', (signal) => apiSend<MediaProcessingPolicy>(MEDIA_PROCESSING_URL,
                  { playback_acceleration: String(mode) }, 'POST', signal), (saved) => {
                  queryClient.setQueryData(MEDIA_PROCESSING_KEY, saved);
                  receipt('Transcode method saved');
                });
              }}>
              <SelectItem id="auto">Automatic (hardware first)</SelectItem>
              <SelectItem id="software">Software codec</SelectItem>
            </Select>
          </div>
        </SettingsRow>
      </Rows>
      {action.busy ? <Stack divided><Help role="status">Saving…</Help></Stack> : null}
      {error ? <Stack divided><ErrorText>{error}</ErrorText></Stack> : null}
    </Section>
  );
}
