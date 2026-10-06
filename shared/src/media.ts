/**
 * Question media. Nothing is uploaded to the server: a question either links to media hosted
 * elsewhere (YouTube, Google Drive, any https image or video), or names a file that is loaded
 * from the projector computer at the event (works offline).
 */

export const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_SOURCES = ['LINK', 'LOCAL'] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const LOCAL_VIDEO_EXTENSIONS = ['mp4', 'webm', 'm4v', 'ogv', 'mov'] as const;
export const LOCAL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] as const;

export const MEDIA_REF_MAX = 500;

/** How a browser should render a piece of media. */
export type MediaPlayer =
  | { player: 'youtube'; embedUrl: string }
  | { player: 'drive-video'; embedUrl: string }
  | { player: 'video'; src: string }
  | { player: 'image'; src: string }
  | { player: 'local'; fileName: string; kind: MediaKind };

/** Media as stored on a question. All three fields are set together, or none. */
export interface MediaRef {
  kind: MediaKind;
  source: MediaSource;
  ref: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the video id from the usual YouTube link shapes, or null. */
export function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = match?.[1] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Extracts a Google Drive file id from share/view/open links, or null. */
export function driveFileId(url: URL): string | null {
  if (url.hostname !== 'drive.google.com') return null;
  const fromPath = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})/)?.[1];
  const id = fromPath ?? url.searchParams.get('id');
  return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

/** Parses an https link; anything else (http:, javascript:, data:, relative paths) is rejected. */
export function parseMediaLink(ref: string): URL | null {
  try {
    const url = new URL(ref.trim());
    // https only: http media would be blocked as mixed content on an https site.
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Problems with a media reference, or null when it is usable. */
export function mediaProblem(media: MediaRef): string | null {
  const ref = media.ref.trim();
  if (!ref) return 'Enter a link or a file name';
  if (ref.length > MEDIA_REF_MAX) return 'The media link is too long';

  if (media.source === 'LINK') {
    const url = parseMediaLink(ref);
    if (!url) return 'Media link must start with https://';
    if (media.kind === 'IMAGE' && youtubeId(url)) return 'A YouTube link is a video, not an image';
    return null;
  }

  if (/[\\/]/.test(ref) || ref.startsWith('.')) return 'Enter only the file name, e.g. round2-q1.mp4 (no folders)';
  const extension = ref.split('.').pop()?.toLowerCase() ?? '';
  const allowed: readonly string[] = media.kind === 'VIDEO' ? LOCAL_VIDEO_EXTENSIONS : LOCAL_IMAGE_EXTENSIONS;
  if (!allowed.includes(extension)) {
    return `File must end with .${allowed.join(', .')}`;
  }
  return null;
}

/** Decides how to show media: YouTube and Drive get privacy-friendly embeds, other links play natively. */
export function resolveMedia(media: MediaRef): MediaPlayer | null {
  if (mediaProblem(media)) return null;
  const ref = media.ref.trim();
  if (media.source === 'LOCAL') return { player: 'local', fileName: ref, kind: media.kind };

  const url = parseMediaLink(ref)!;
  if (media.kind === 'VIDEO') {
    const yt = youtubeId(url);
    if (yt) {
      const start = Number.parseInt(url.searchParams.get('t') ?? url.searchParams.get('start') ?? '', 10);
      const params = new URLSearchParams({
        enablejsapi: '1',
        rel: '0',
        modestbranding: '1',
        playsinline: '1',
        controls: '1',
        ...(Number.isFinite(start) && start > 0 ? { start: String(start) } : {}),
      });
      return { player: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?${params}` };
    }
    const drive = driveFileId(url);
    if (drive) return { player: 'drive-video', embedUrl: `https://drive.google.com/file/d/${drive}/preview` };
    return { player: 'video', src: url.toString() };
  }

  const drive = driveFileId(url);
  // Drive's share page isn't an image; this host serves the file itself for publicly shared images.
  if (drive) return { player: 'image', src: `https://lh3.googleusercontent.com/d/${drive}` };
  return { player: 'image', src: url.toString() };
}

/** Local media files a competition needs on the projector computer. */
export function localMediaFiles(questions: ReadonlyArray<Partial<MediaRef> & { kind?: MediaKind | null }>): string[] {
  const names = new Set<string>();
  for (const q of questions) {
    if (q.source === 'LOCAL' && q.ref) names.add(q.ref.trim());
  }
  return [...names].sort();
}
