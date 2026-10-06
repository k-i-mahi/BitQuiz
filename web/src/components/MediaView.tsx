import { useEffect, useRef, useState } from 'react';
import { FolderOpen, ImageOff, Play } from 'lucide-react';
import { resolveMedia, type MediaPlayback, type QuestionMedia } from '@bitquiz/shared';
import { findLocalUrl, type LocalMediaUrls } from '@/lib/localMedia';
import { cn } from '@/lib/utils';

interface Props {
  media: QuestionMedia;
  /** Follow the console's play / pause / restart. Without it, video shows a paused preview. */
  playback?: MediaPlayback;
  /** Files loaded on this computer, for media stored as "file on projector computer". */
  localUrls?: LocalMediaUrls;
  muted?: boolean;
  className?: string;
}

/** Shows question media: images, YouTube and Drive embeds, linked or local video files. */
export function MediaView({ media, playback, localUrls, muted = false, className }: Props) {
  const player = resolveMedia(media);
  const frame = cn('relative overflow-hidden rounded-[inherit] bg-black/40', className);

  if (!player) return <MediaMessage className={frame} icon="broken" text="This media link can't be shown." />;

  if (player.player === 'local') {
    const src = localUrls ? findLocalUrl(localUrls, player.fileName) : undefined;
    if (!src) {
      return (
        <MediaMessage
          className={frame}
          icon="folder"
          text={
            localUrls
              ? `Load “${player.fileName}” on this screen`
              : `${player.fileName} (plays on the projector computer)`
          }
        />
      );
    }
    return player.kind === 'IMAGE' ? (
      <ImageMedia src={src} className={frame} />
    ) : (
      <VideoMedia src={src} playback={playback} muted={muted} className={frame} />
    );
  }

  if (player.player === 'image') return <ImageMedia src={player.src} className={frame} />;
  if (player.player === 'video')
    return <VideoMedia src={player.src} playback={playback} muted={muted} className={frame} />;
  if (player.player === 'youtube') {
    return <YouTubeMedia embedUrl={player.embedUrl} playback={playback} muted={muted} className={frame} />;
  }
  return (
    <div className={frame}>
      <iframe
        src={player.embedUrl}
        title="Question video"
        allow="autoplay; encrypted-media; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="size-full border-0"
      />
    </div>
  );
}

function MediaMessage({ text, icon, className }: { text: string; icon: 'folder' | 'broken'; className: string }) {
  const Icon = icon === 'folder' ? FolderOpen : ImageOff;
  return (
    <div className={cn(className, 'grid place-items-center p-6 text-center')}>
      <div className="flex flex-col items-center gap-2 text-muted">
        <Icon className="size-8" aria-hidden />
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}

function ImageMedia({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaMessage className={className} icon="broken" text="The image couldn't be loaded." />;
  return (
    <div className={className}>
      <img
        src={src}
        alt="Question media"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full object-contain"
      />
    </div>
  );
}

function VideoMedia({
  src,
  playback,
  muted,
  className,
}: {
  src: string;
  playback?: MediaPlayback;
  muted: boolean;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const lastRestart = useRef<number | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !playback) return;
    if (lastRestart.current !== null && lastRestart.current !== playback.restartCount) video.currentTime = 0;
    lastRestart.current = playback.restartCount;
    if (playback.playing) {
      video.play().then(
        () => setBlocked(false),
        // Browsers block sound until someone clicks the page; offer a click to start.
        () => setBlocked(true),
      );
    } else video.pause();
  }, [playback?.playing, playback?.restartCount, playback]);

  return (
    <div className={className}>
      <video
        ref={ref}
        src={src}
        muted={muted}
        playsInline
        preload="auto"
        controls={!playback}
        className="size-full object-contain"
      />
      {blocked && (
        <button
          type="button"
          onClick={() =>
            ref.current?.play().then(
              () => setBlocked(false),
              () => undefined,
            )
          }
          className="absolute inset-0 grid place-items-center bg-black/60 text-white"
        >
          <span className="flex items-center gap-3 rounded-2xl bg-accent px-6 py-4 text-xl font-semibold text-bg">
            <Play className="size-6" aria-hidden /> Click to start the video
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * YouTube player controlled through its postMessage API (no extra script from YouTube needed).
 * YouTube rejects embeds without a referrer (error 153), so the iframe sends the site origin only.
 */
function YouTubeMedia({
  embedUrl,
  playback,
  muted,
  className,
}: {
  embedUrl: string;
  playback?: MediaPlayback;
  muted: boolean;
  className: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const lastRestart = useRef<number | null>(null);

  const send = (func: string, args: unknown[] = []) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

  useEffect(() => {
    if (!loaded || !playback) return;
    if (lastRestart.current !== null && lastRestart.current !== playback.restartCount) send('seekTo', [0, true]);
    lastRestart.current = playback.restartCount;
    send(muted ? 'mute' : 'unMute');
    send(playback.playing ? 'playVideo' : 'pauseVideo');
  }, [loaded, muted, playback?.playing, playback?.restartCount, playback]);

  // Fixed per video: changing the iframe address would reload the player, so later play/pause
  // changes go through postMessage instead.
  const [src] = useState(() => (playback?.playing ? `${embedUrl}&autoplay=1${muted ? '&mute=1' : ''}` : embedUrl));

  return (
    <div className={className}>
      <iframe
        ref={ref}
        src={src}
        title="Question video"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setTimeout(() => setLoaded(true), 600)}
        className="size-full border-0"
      />
    </div>
  );
}
