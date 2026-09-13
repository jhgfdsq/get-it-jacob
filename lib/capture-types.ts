// Modified September 2026 for Get It Jacob; see NOTICE.
/** Browser-safe metadata. The server always owns names, ids and file paths. */
export type CaptureAttachment = {
  id: string;
  name: string;
  pageIndex: number;
  width: number;
  height: number;
  url: string;
};
export type CaptureSource = {
  dataUrl: string;
  pageIndex: number;
  width: number;
  height: number;
};
export const MAX_CAPTURES_PER_MESSAGE = 24;
export const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
export const MAX_CAPTURE_DIMENSION = 8192;
export const MAX_CAPTURE_PIXELS = 24_000_000;
