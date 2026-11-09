/* Data contract for cropping covers.
 *
 * There is one write endpoint: sending a box sets manual cropping, sending null recomputes from the fold heuristics.
 * The box is in source-image pixels, right and bottom exclusive, in the same coordinate system as the read-only `poster_box` field. */
import { apiSend } from '../../api';
import type { CropBox } from '../../crop-geometry';

export const COVER_CROP_URL = '/api/cover-crop';

export interface CoverCropResult {
  ok: boolean;
  code: string;
  poster_box: { x0: number; y0: number; x1: number; y1: number; method: string; px: number[] } | null;
}

export const sendCoverCrop = (code: string, box: CropBox | null) =>
  apiSend<CoverCropResult>(COVER_CROP_URL, { code, box });
