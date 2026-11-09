/* Data contract for changing the avatar.
 *
 * Candidate images go through `/avatar-choice?ref=`: the page only passes refs the server itself listed, and the URL is assembled by the server from the index.
 * A hand-entered URL first goes to `/api/avatar-frame`; after passing the server's public-IP check and being fetched into the cache, it becomes
 * a `url:` ref; local files use the candidate preview converted by the server, and on confirm the original bytes are sent. */
import { ApiError, apiGet, apiSend } from '../../api';
import {
  centeredBox, frameWithin, isUsableSize, type CropBox, type CropSize,
} from '../../crop-geometry';

export const AVATAR_CHOICES_URL = '/api/avatar-choices';
export const AVATAR_PICK_URL = '/api/avatar-pick';
export const AVATAR_CODE_COVER_URL = '/api/avatar-code-cover';
export const AVATAR_FRAME_URL = '/api/avatar-frame';
const AVATAR_CHOICE_IMAGE_URL = '/avatar-choice';

export interface AvatarChoice {
  ref: string;
  source: 'gfriends' | 'history' | 'asset' | 'code' | 'url' | 'upload' | 'social' | 'online';
  label: string;
  width: number;
  height: number;
  detail: string;
  /** Which name this cell was found by in the gallery. An empty string when only one name hit. */
  found_by: string;
  current: boolean;
  user_cropped?: boolean;
  /** This cell must crop to a region before fitting. The video frame is landscape; fitting the whole image into the circle leaves only background. */
  crop: boolean;
  /** Base images that can be swapped during frame selection, given by ref: the cover plus the nine grid cells. */
  bases: string[];
  /** The region of the cover meant for cropping (a square around the face; sleeves with no detected face use the front cover), in source-image pixels.
   *  It only counts for the `ref` image at the `width`×`height` size. */
  focus: CropBox | null;
  /** How many performers this video has; 0 means unknown. With more than one, `focus` is not centered on the face on the cover,
   *  which is most likely the other, leading performer. */
  cast: number;
  /** The version of the cover's base image. Covers replace in place, so the preview URL must carry it to avoid showing the old image; it is passed back with the box
   *  so the server can tell which image the box was drawn on. Other base images never change in place and use an empty string. */
  version: string;
}

export interface AvatarChoices {
  kind: string;
  entity_id: number;
  names: string[];
  /** The names in the chain that actually have images in the gallery, in chain order. */
  matched_names: string[];
  choices: AvatarChoice[];
  index_age_hours: number | null;
  index_stale: boolean;
  index_refreshing?: boolean;
  index_error?: string;
}

/** One key per person: a different person means a different candidate set, and the previous person's must not be read. */
export const avatarChoicesKey = (kind: string, id: number) => ['avatar-choices', kind, id] as const;

const query = (kind: string, id: number) => `?kind=${encodeURIComponent(kind)}&id=${id}`;

export const choiceImageUrl = (kind: string, id: number, ref: string, version = '') =>
  `${AVATAR_CHOICE_IMAGE_URL}${query(kind, id)}&ref=${encodeURIComponent(ref)}`
  + (version ? `&v=${encodeURIComponent(version)}` : '');

/** The base image `ref` version: only the cover has one; the grid cells are empty strings. */
export const baseVersion = (choice: AvatarChoice, ref: string): string =>
  ref.startsWith('cover:') || ref.endsWith(':cover') ? choice.version : '';

export const fetchAvatarChoices = (kind: string, id: number, signal?: AbortSignal) =>
  apiGet<AvatarChoices>(AVATAR_CHOICES_URL + query(kind, id), signal);

/** Fetches a cover by code to frame. The code need not be in the library: when the local machine lacks it, the server fetches from official channels. */
export const fetchCodeCover = (code: string) =>
  apiSend<AvatarChoice>(AVATAR_CODE_COVER_URL, { code });

/** Before a portrait cell enters box selection, the server-measured dimensions, detected faces and swappable base images merge into that cell's own description.
 *  While gallery images have not been fetched, dimensions are 0, and the default box lands by face only when the dimensions match. */
export async function frameChoice(kind: string, id: number, choice: AvatarChoice): Promise<AvatarChoice> {
  const framed = await apiSend<AvatarChoice>(AVATAR_FRAME_URL, { kind, id, ref: choice.ref });
  return { ...choice, width: framed.width, height: framed.height, focus: framed.focus, bases: framed.bases };
}

/** A hand-entered address: the server applies the public-network criteria, fetches once into its cache, and returns a `url:` candidate. */
export const frameAddress = (kind: string, id: number, url: string) =>
  apiSend<AvatarChoice>(AVATAR_FRAME_URL, { kind, id, url });

/** Local files: submitted as original bytes, converted by the server into a static preview that returns a candidate reference. */
export const frameFile = (kind: string, id: number, file: File) =>
  sendBytes<AvatarChoice>(`${AVATAR_FRAME_URL}${query(kind, id)}&name=${encodeURIComponent(file.name)}`, file);

/* Local files are sent as raw bytes, not multipart: parsing multipart would add a dependency, and here there is
   one file and no other fields, so the file name and the box travel in the query string. The body is not JSON, so it does not go through `apiSend`. */
async function sendBytes<T>(url: string, file: File): Promise<T> {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', body: file });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (response.ok) return payload as T;
  throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status, payload);
}

/** The region of one candidate cropped by `aspect`: if a crop region exists, crop within it; otherwise center the whole image.
 *  When `size` is not this cell's own image (the base image changed), always center: a crop region only counts for its own pixels. */
export function choiceFrame(choice: AvatarChoice, size: CropSize, aspect: number): CropBox {
  const own = size.width === choice.width && size.height === choice.height;
  return choice.focus && own ? frameWithin(choice.focus, size, aspect) : centeredBox(size, aspect);
}

/** Whether the cell frames itself: only the paths that crop (video frames, coded covers) are landscape. Portrait gallery
 *  photos keep `object-cover`, as do images of unknown size. */
export const framesItself = (choice: AvatarChoice): boolean =>
  choice.crop && isUsableSize({ width: choice.width, height: choice.height });

/** The box-selected region, in source pixels with an exclusive bottom-right bound. The backend crops with the same integers. */
export interface AvatarCrop { x0: number; y0: number; x1: number; y1: number }

/** The two paths hand up different things but land on the same endpoint. `crop` is the shared optional step; without it the whole image is loaded. */
export type AvatarSubmission =
  | { ref: string; crop?: AvatarCrop; version?: string }
  | { file: File; crop?: AvatarCrop };

export async function sendAvatarPick(
  kind: string, id: number, submission: AvatarSubmission,
): Promise<void> {
  if (!('file' in submission)) {
    await apiSend(AVATAR_PICK_URL, { kind, id, ...submission });
    return;
  }
  const { file, crop } = submission;
  const box = crop ? `&crop=${[crop.x0, crop.y0, crop.x1, crop.y1].join(',')}` : '';
  await sendBytes(`${AVATAR_PICK_URL}${query(kind, id)}&name=${encodeURIComponent(file.name)}${box}`, file);
}

/** How many aliases the description names. Any more is a wall of text that squeezes the candidate grid down to one row. */
const NOTE_NAMES = 2;

/** Keep the description to one sentence: this screen already explains with pictures what is being chosen, and one more line is one more thing to read.
 *  Say which name found it; matching the wrong person is the only big mistake here, and the name is the only clue. With many names,
 *  name the first two and report the rest as a count; which cell matched whom goes in the cell's title. */
export function pickerNote(name: string, data: AvatarChoices | undefined): string {
  // While candidates are in flight the grid shows Skeleton, so this adds no separate "Loading" line.
  if (!data) return name;
  const elsewhere = data.matched_names.filter((one) => one !== name);
  if (elsewhere.length) {
    const named = `"${elsewhere.slice(0, NOTE_NAMES).join('", "')}"`;
    const more = elsewhere.length > NOTE_NAMES ? `Waiting for ${elsewhere.length.toLocaleString()} names` : '';
    return `${name}: found in the image library by ${named}${more}.`;
  }
  return data.choices.length ? name : `${name}: no alternate image yet. Enter a code, an image URL, or pick a local file.`;
}

/** 图库索引正在更新或更新失败时的那句提示；别的情形是空串。 */
export function indexNote(data: AvatarChoices | undefined): string {
  if (data?.index_refreshing) return 'Updating the gallery index; candidate images will appear automatically.';
  if (data?.index_error && data.index_stale) return 'Gallery index unavailable:' + data.index_error;
  return '';
}

/** Videos with multiple performers: the cell shows a headcount, and box selection reminds her to find her own face first. */
export const sharedCast = (choice: AvatarChoice): boolean => choice.cast > 1;

export const cropNote = (choice: AvatarChoice): string =>
  sharedCast(choice)
    ? `${choice.label}: ${choice.cast.toLocaleString()} people co-starring; find her own face first, then drag the box to select a region.`
    : `${choice.label}${choice.source === 'social' && choice.detail ? ` · ${choice.detail}` : ''}: drag the box to pick an area; the wheel or the corner square resizes it.`;

const SOURCE_LABELS: Record<string, string> = {
  gfriends: 'Gallery', history: 'Used', asset: 'Video frames', code: 'Code cover',
  url: 'Address', upload: 'This machine', social: 'Social avatars', online: 'Online videos',
};

/** The name of each cell in the base image row: one cover cell, and the nine grid cells counted by position. */
export function baseLabel(ref: string): string {
  if (ref.startsWith('follow:')) {
    const what = ref.split(':')[2];
    return what === 'cover' ? 'Video cover' : `Content image ${Number(what.replace('image', '') || 0) + 1}`;
  }
  if (ref.startsWith('cover:')) return 'Cover';
  const what = ref.split(':')[2] || '';
  if (what === 'cover') return 'Cover';
  const cell = Number(what.replace('cell', ''));
  return Number.isFinite(cell) ? `Cell ${cell + 1}` : what;
}

/** The cell's full description, going into `title`: where it came from, how big it is, and who it was matched by. Video frames append the server's note:
 *  the title, and "representative frame, not this person" when the account has no identity basis for the person. */
export const choiceDetail = (choice: AvatarChoice): string =>
  `${SOURCE_LABELS[choice.source] || choice.source} · ${choice.label}`
  + (choice.width ? ` · ${choice.width}×${choice.height}` : '')
  + (sharedCast(choice) ? ` · ${choice.cast.toLocaleString()} co-stars` : '')
  + (choice.found_by ? ` · found via "${choice.found_by}"` : '')
  + (['asset', 'social', 'history'].includes(choice.source) && choice.detail && choice.detail !== choice.label ? ` · ${choice.detail}` : '');
