/* Avatar swap: the plus at the profile page's round frame corner.
 *
 * The auto-picked one follows source priority, and that order answers "which to try first", not "which suits an avatar": the
 * top of an image library is often a photo-book cover pressing down on the title, while a studio's straight-on original is a
 * few cards down. So no smarter auto-pick is attempted here; the candidates are spread out so one glance is enough to swap.
 *
 * This screen answers "which one to switch to", so the candidate grid takes all the middle height, with the header and the
 * bottom row of actions fixed and only the grid scrolling. Candidates are fetched only when the popover opens: the profile
 * page prefetches a round every visit and usually nobody clicks. The popover shell is
 * `../components/modal-frame.tsx`. */
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { RiAddLine, RiCloseLine, RiUserLine } from '@remixicon/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Heading } from 'react-aria-components';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { IconButton } from '@/components/base/buttons/icon-button';
import { Input } from '@/components/base/input/input';

import { errorMessage } from '../../api';
import {
  centeredBox, isUsableSize, previewStyle, windowStyle, type CropBox, type CropSize,
} from '../../crop-geometry';
import type { AvatarPickerProps } from '../bundle';
import { ModalFrame, ModalGlyph } from '../components/modal-frame';
import { Note } from '../components/note';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { CropFrame } from '../crop/crop-frame';
import { queryClient } from '../query';
import { busyProps } from '../settings/use-action';
import {
  avatarChoicesKey, baseLabel, baseVersion, choiceDetail, choiceFrame, choiceImageUrl, cropNote,
  fetchAvatarChoices, fetchCodeCover, frameAddress, frameChoice, frameFile, framesItself, indexNote,
  pickerNote, sendAvatarPick, sharedCast,
  type AvatarChoice, type AvatarSubmission,
} from './avatar-picker';

/** Placeholder cells while candidates are still loading: two rows of four, about as tall as the most common screen of candidates. */
const SKELETON_TILES = 8;
/** The cell's ratio, the same number as `--aspect-avatar-choice`. */
const TILE_ASPECT = 3 / 4;

/** Box selection uses the server-converted candidates; local files submit original bytes on confirmation. */
interface Cropping { choice: AvatarChoice; file?: File }

/** The four ways into frame selection. All ask the server first: how big the image is and where the faces are. */
type Opening =
  | { via: 'choice'; choice: AvatarChoice }
  | { via: 'code'; code: string }
  | { via: 'url'; url: string }
  | { via: 'file'; file: File };

/** The crop region frame selection returned; null applies the whole image. */
type CropPick = { ref: string; crop: CropBox; version: string } | null;

async function openCrop(kind: string, id: number, wanted: Opening): Promise<Cropping> {
  switch (wanted.via) {
    case 'choice': return { choice: await frameChoice(kind, id, wanted.choice) };
    case 'code': return { choice: await fetchCodeCover(wanted.code) };
    case 'url': return { choice: await frameAddress(kind, id, wanted.url) };
    case 'file': return { choice: await frameFile(kind, id, wanted.file), file: wanted.file };
  }
}

export function AvatarPicker({ kind, entityId, name, onPicked }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* The plus sits on the round frame's bottom-right edge: it belongs to this avatar, and any farther becomes a button on the
          page with no visible purpose. Positioning belongs to this outer layer; the avatar image itself carries
          `z-index:1`, so this layer must rise above it or half the button hides under the image. The button shrinks to a
          28px circle: it sits on the edge of a circle, and a square button across the arc would cover a chunk of face; a
          page-background-colored outline separates it from the image. BoardUI's IconButton only comes square and the shape is
          the component's own business, so this is a native button, taking base color, border, hover and focus ring from the
          same token set. On hover the base color lets the face behind show through: the dark tier's hover color is already
          60% transparent while the light tier is solid, so the same 60% is added here and both tiers read as the same
          action. */}
      <span className="absolute right-1 bottom-1 z-10">
        <button type="button" aria-haspopup="dialog" aria-label={`Change the avatar of ${name}`}
          onClick={() => setOpen(true)}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-xs outline-none ring-2 ring-background-full transition-colors hover:border-border-button-hover hover:bg-background-primary-hover/60 dark:hover:bg-background-primary-hover focus-visible:ring-border-focus-ring active:bg-background-primary-active">
          <RiAddLine aria-hidden className="size-4" />
        </button>
      </span>
      <ModalFrame isOpen={open} onOpenChange={setOpen} width="avatar-picker" label="Change avatar">
        <PickerBody kind={kind} entityId={entityId} name={name} onPicked={onPicked}
          close={() => setOpen(false)} />
      </ModalFrame>
    </>
  );
}

/** Popover content. Mounted only while the popover is open, so candidates are fetched only then as well. */
function PickerBody({ kind, entityId, name, onPicked, close }: AvatarPickerProps & { close(): void }) {
  const file = useRef<HTMLInputElement>(null);
  const grid = useOverlayScrollbar<HTMLDivElement>();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  /* Clicking any image opens box selection, not an immediate image swap: gallery portraits are mostly full-body vertical shots, and fitting the whole image into a circle leaves the face a
     small patch. It replaces the full screen instead of stacking another popover: this step wants the largest possible base image, and popovers on popovers
     only make it smaller. */
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [lostChoices, setLostChoices] = useState<Set<string>>(new Set());
  const [imageAttempts, setImageAttempts] = useState<Record<string, number>>({});
  const key = avatarChoicesKey(kind, entityId);
  const picked = useRef(false);

  const listing = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchAvatarChoices(kind, entityId, signal),
    // Re-read on failure or stale index; valid candidates are reused across repeated open and close.
    retryOnMount: true,
    refetchOnMount: (query) => query.state.data?.index_stale ? 'always' : false,
    refetchInterval: (query) => query.state.data?.index_refreshing && !query.state.error ? 1000 : false,
  });
  /* After a successful switch, which candidate is "in use" is stale, so throw it away and refetch on next open. Wait until the popover
     has actually closed before discarding: someone is still reading that key right now, and clearing it on the spot would trigger an immediate refetch, a wasted round trip. */
  useEffect(() => () => {
    if (picked.current) queryClient.removeQueries({ queryKey: avatarChoicesKey(kind, entityId) });
  }, [kind, entityId]);
  /* The three sources share one exit; on success close in place and have the host repaint. Failure stays put and states the reason:
     this step changes the image on disk, so a silent failure would read as a successful swap. */
  const submit = useMutation({
    mutationFn: (submission: AvatarSubmission) => sendAvatarPick(kind, entityId, submission),
    onSuccess: () => {
      picked.current = true;
      close();
      onPicked();
    },
  });
  /* Before entering box selection, wait for the server's measurement before switching screens: lay a centered box first and move it once the face returns; the person may already be dragging.
     The video-frame group needs no ask; the list already carries sizes and crop regions. */
  const opening = useMutation({
    mutationFn: (wanted: Opening) => openCrop(kind, entityId, wanted),
    onMutate: () => { submit.reset() },
    onSuccess: setCropping,
  });
  const opens = (via: Opening['via']) => opening.isPending && opening.variables?.via === via;

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const chosen = input.files?.[0];
    input.value = '';
    if (chosen && !busy) opening.mutate({ via: 'file', file: chosen });
  }

  /* The box-selection result is submitted by its origin: local files send the raw bytes again, everything else by ref. The full-image path
     carries no box and no version; a whole image has no "which version was the box drawn on" question. */
  function pickCrop(picked: CropPick) {
    if (submit.isPending || !cropping) return;
    const { choice, file } = cropping;
    if (file) submit.mutate(picked ? { file, crop: picked.crop } : { file });
    else submit.mutate(picked ?? { ref: choice.ref });
  }

  const data = listing.data;
  const choices = data?.choices ?? [];
  const problem = (submit.error ? errorMessage(submit.error) : '')
    || (!cropping && opening.error ? errorMessage(opening.error) : '')
    || (listing.error ? errorMessage(listing.error) : '');
  const busy = submit.isPending || opening.isPending;
  const index = cropping ? '' : indexNote(data);
  // A 'Retry' next to the hint only when the candidates fetch failed: on submit or cover-fetch failure, the button itself is what retries.
  const listingFailed = !!problem && !!listing.error && problem === errorMessage(listing.error);
  // When candidates come back empty (or never arrive) the grid band is left out: an empty gap between two dividers reads as still waiting.
  const showGrid = listing.isPending || choices.length > 0;
  return (
    <>
      {/* Header: a square icon slot on the left, title plus one explainer line on the right, with the close button at the top right. */}
      <div className="flex shrink-0 items-start gap-4 p-5">
        <ModalGlyph><RiUserLine className="size-6" /></ModalGlyph>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading slot="title" className="text-title-3-semibold text-text-primary">
              {cropping ? 'Boxes the avatar region' : 'Change avatar'}
            </Heading>
            {!cropping && choices.length ? <Chip color="soft">{choices.length.toLocaleString()} available</Chip> : null}
          </div>
          <p className="text-body-2-regular text-text-secondary">
            {cropping ? cropNote(cropping.choice) : pickerNote(name, data)}
          </p>
          {index ? <Note tone="neutral">{index}</Note> : null}
          {problem ? (
            <Note tone="error" action={listingFailed ? (
              <Button variant="secondary" size="small" {...busyProps(listing.isFetching)}
                onClick={() => { if (!listing.isFetching) void listing.refetch() }}>Retry now</Button>
            ) : undefined}>{problem}</Note>
          ) : null}
        </div>
        <IconButton icon={RiCloseLine} size="small" aria-label="Close" onClick={close} />
      </div>
      {cropping ? (
        <CropStep kind={kind} entityId={entityId} choice={cropping.choice}
          busy={submit.isPending} back={() => { submit.reset(); opening.reset(); setCropping(null) }} confirm={pickCrop} />
      ) : (
      <>
      {/* The candidate grid is the only scrolling layer on this screen: the header and the bottom actions row never move no matter how long. Keep 16px top and bottom:
          leaving only the top would put the last image row flush against the bottom line. This outer layer exists only to host the overlay scrollbar's
          track, which lays out with `absolute` and needs a positioned ancestor wrapping only the scrolling block itself. */}
      {showGrid ? (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={grid} className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-separator-border px-5 py-4">
          {/* Before candidates return, lay placeholders of the same cell kind, with the same outer frame, ratio, and label row as real cells,
              so the grid does not jump when real cells swap in. */}
          <div role="listbox" aria-label="Alternate avatars" aria-busy={listing.isPending || undefined}
            data-skeleton={listing.isPending ? 'avatar-choices' : undefined}
            className="inline-grid grid-cols-3 content-start gap-2 sm:grid-cols-4">
            {listing.isPending ? Array.from({ length: SKELETON_TILES }, (_, index) => (
              <span key={index} aria-hidden data-avatar-skeleton
                className="flex flex-col gap-1 overflow-hidden rounded-2lg border border-separator-border bg-background-secondary-default pb-1 text-caption-1-regular">
                <span className="relative block w-full aspect-avatar-choice skeleton-sheen" />
                <span className="relative mx-auto w-2/3 rounded-sm skeleton-sheen">&nbsp;</span>
              </span>
            )) : choices.map((choice) => (
              <button type="button" key={choice.ref} role="option" data-avatar-choice
                aria-selected={choice.current} title={choiceDetail(choice)} {...busyProps(busy)}
                onClick={() => {
                  if (busy) return;
                  if (lostChoices.has(choice.ref)) {
                    setLostChoices(previous => new Set([...previous].filter(ref => ref !== choice.ref)));
                    setImageAttempts(previous => ({ ...previous, [choice.ref]: (previous[choice.ref] || 0) + 1 }));
                    opening.reset();
                    submit.reset();
                    return;
                  }
                  if (choice.crop) { submit.reset(); opening.reset(); setCropping({ choice }) }
                  else opening.mutate({ via: 'choice', choice });
                }}
                className="relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-2lg border border-separator-border bg-background-secondary-default pb-1 text-center text-caption-1-regular text-text-secondary outline-none hover:border-border-button-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring aria-selected:border-border-focus-ring aria-selected:bg-background-tertiary-default aria-selected:text-text-primary aria-disabled:cursor-progress aria-disabled:opacity-60">
                <ChoiceImage key={imageAttempts[choice.ref] || 0}
                  src={choiceImageUrl(kind, entityId, choice.ref, baseVersion(choice, choice.ref))}
                  choice={choice} onUnavailable={() => setLostChoices(previous => new Set(previous).add(choice.ref))} />
                <span className="truncate px-1">{choice.label}</span>
                {choice.current
                  ? <span className="absolute top-1 left-1"><Chip variant="caption" color="gray">In use</Chip></span>
                  : null}
                {/* On a co-starred cover the largest face usually belongs to the other lead, so the cell does not frame around it; the headcount is shown here instead. */}
                {sharedCast(choice) || choice.user_cropped
                  ? <span className="absolute top-1 right-1"><Chip variant="caption" color="gray">{sharedCast(choice) ? `${choice.cast.toLocaleString()} people` : 'Cropped'}</Chip></span>
                  : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      ) : null}
      {/* Code, manually entered address, and local files are parallel paths alongside the candidates, not a supplement after reviewing candidates, so they sit in
          a fixed block: no matter how long the grid gets, it never pushes them out of sight. */}
      <div className="flex shrink-0 flex-col gap-3 border-t border-separator-border p-5">
        {/* The code field goes out to the network and is a side-effecting submit, so it gets a button; Enter still works. */}
        <form className="flex min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim() && !busy) opening.mutate({ via: 'code', code: code.trim() });
          }}>
          <div className="min-w-0 flex-1">
            <Input aria-label="Code" placeholder="Code, e.g. ABW-232" value={code} onChange={setCode} />
          </div>
          <Button type="submit" variant="secondary" disabled={!code.trim()}
            {...busyProps(opens('code'))}>Use cover to frame</Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => file.current?.click()}
            {...busyProps(opens('file'))}>Pick an image from this machine</Button>
          {/* The native file picker's look is not controllable: the button is BoardUI's, and the input remains only to receive files. */}
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff,image/x-icon,image/vnd.microsoft.icon,image/jp2,.jpg,.jpeg,.jpe,.jfif,.png,.webp,.avif,.gif,.bmp,.dib,.tif,.tiff,.ico,.jp2,.j2k,.jpf,.jpx" tabIndex={-1} aria-hidden
            className="hidden" onChange={pickFile} />
          <span className="text-caption-1-regular text-text-secondary">Supports common image formats, using the first frame for animations</span>
          {/* The address row gets at least 224px: on narrow screens, when it and "pick image from this machine" cannot fit one row, the whole row wraps down so the input is not squeezed into a slit. */}
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input type="url" aria-label="Image address" placeholder="https://…" value={url} onChange={setUrl} />
            </div>
            <Button variant="secondary" disabled={!url.trim()} {...busyProps(opens('url'))}
              onClick={() => { if (!busy) opening.mutate({ via: 'url', url: url.trim() }) }}>Use this address</Button>
          </div>
        </div>
      </div>
      </>
      )}
    </>
  );
}

/** One candidate cell's image. Before the image arrives the cell is a skeleton shimmer; on arrival the skeleton fades out and the image sharpens from blur.
 *
 *  Landscapes to be framed (video stills, code covers) are not spread full-bleed and centered: a cover's center is often the spine or background, so the cell
 *  takes a 3:4 slice out of the backend-provided region of interest, and what you see is the face the framing step frames by default. Portrait gallery
 *  photos keep `object-cover`. */
function ChoiceImage({ src, choice, onUnavailable }: {
  src: string; choice: AvatarChoice; onUnavailable(): void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [lost, setLost] = useState(false);
  /* A cached image may have finished decoding before `onLoad` was attached, and that `load` event will never come again. */
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth) setRevealed(true);
  }, []);
  const size = { width: choice.width, height: choice.height };
  const place = framesItself(choice) ? windowStyle(choiceFrame(choice, size, TILE_ASPECT), size) : null;
  const shown = revealed || lost ? true : undefined;
  return (
    <span data-choice-lost={lost || undefined}
      className="relative block w-full aspect-avatar-choice overflow-hidden">
      {/* 失败保留来源与重试入口，不把空白格当作可进入框选的图片。 */}
      {lost ? <span className="absolute inset-0 flex items-center justify-center px-3">Image not obtained; click to retry</span>
        : <img ref={image} loading="lazy" alt="" src={src} data-revealed={shown}
        onLoad={() => setRevealed(true)} onError={() => { setLost(true); onUnavailable() }}
        className={place
          ? 'reveal-content absolute max-w-none top-(--tile-top) left-(--tile-left) h-(--tile-height) w-(--tile-width)'
          : 'reveal-content absolute inset-0 size-full object-cover'}
        style={place ? {
          '--tile-top': place.top, '--tile-left': place.left,
          '--tile-height': place.height, '--tile-width': place.width,
        } as CSSProperties : undefined} />}
      <span aria-hidden data-revealed={shown}
        className="reveal-skeleton pointer-events-none absolute inset-0 skeleton-sheen" />
    </span>
  );
}

/** The framing step: one base image, one box, one round preview.
 *
 *  The ratio is locked at 1:1 with no unlock: the avatar frame is round, a non-square image would only be cropped again, and where the second
 *  crop lands is decided by CSS, voiding what was framed here.
 *
 *  Images that need not be framed (the portrait paths) get an extra "Use whole image": some images are already a usable headshot. */
function CropStep({ kind, entityId, choice, busy, back, confirm }: {
  kind: string; entityId: number; choice: AvatarChoice; busy: boolean;
  back(): void; confirm(picked: CropPick): void;
}) {
  const bases = choice.bases.length ? choice.bases : [choice.ref];
  const [base, setBase] = useState(bases[0]);
  const [size, setSize] = useState<CropSize | null>(null);
  const [box, setBox] = useState<CropBox | null>(null);
  const version = baseVersion(choice, base);
  const src = choiceImageUrl(kind, entityId, base, version);
  const frame = useOverlayScrollbar<HTMLDivElement>();
  /* Swapping the base image means swapping the image, keeping no numbers from the previous box: the same coordinates on another image are a
     misaligned region, and on screen a misalignment looks no different from "it was framed here all along". */
  function pickBase(next: string) {
    setBase(next);
    setSize(null);
    setBox(null);
  }
  const preview = box && size ? previewStyle(box, size) : null;
  return (
    <>
      <div ref={frame} className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto border-t border-separator-border px-5 py-4">
        {src ? (
          <CropFrame src={src} aspect={1} box={box} size={size}
            label={`${choice.label} avatar crop frame`}
            onSize={(next) => {
              setSize(next);
              /* This cell's own image takes its default box from the crop region: with a face detected, that is exactly the piece batch processing would crop.
                 Switched to one of the nine-grid cells it centers instead, since the crop region only counts for its own image. */
              if (isUsableSize(next)) {
                setBox(base === choice.ref ? choiceFrame(choice, next, 1) : centeredBox(next, 1));
              }
            }}
            onBox={setBox} />
        ) : null}
        {/* The base image row: the cover plus the nine grid cells. Which cell of a video holds a frontal face can only be picked by eye. */}
        {bases.length > 1 ? (
          <div role="radiogroup" aria-label="Base image" className="flex flex-wrap justify-center gap-2">
            {bases.map((ref) => (
              <button type="button" key={ref} role="radio" aria-checked={ref === base}
                data-crop-base onClick={() => pickBase(ref)}
                className="cursor-pointer rounded-lg px-2 py-1 text-caption-1-regular text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring aria-checked:bg-background-tertiary-default aria-checked:text-text-primary">
                {baseLabel(ref)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-separator-border p-5">
        {/* The round preview is exactly how it looks once live. The background image and the one above share the same address, with no extra fetch. */}
        <span aria-hidden data-crop-preview
          className="size-crop-preview shrink-0 rounded-full border border-separator-border bg-background-secondary-default bg-(image:--crop-preview) bg-(position:--crop-preview-at) bg-(length:--crop-preview-size) bg-no-repeat"
          style={preview ? {
            '--crop-preview': `url("${src}")`,
            '--crop-preview-size': preview.size,
            '--crop-preview-at': preview.position,
          } as CSSProperties : undefined} />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={back} {...busyProps(busy)}>Return to alternate images</Button>
          {choice.crop ? null : (
            <Button variant="secondary" {...busyProps(busy)}
              onClick={() => { if (!busy) confirm(null) }}>Use the whole image</Button>
          )}
          <Button disabled={!box || !size} {...busyProps(busy)}
            onClick={() => { if (box && !busy) confirm({ ref: base, crop: box, version }) }}>Use this region</Button>
        </div>
      </div>
    </>
  );
}
