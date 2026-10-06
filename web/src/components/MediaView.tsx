import { useEffect, useRef, useState } from 'react';
import { CircleCheck, FolderOpen, ImageOff, Play } from 'lucide-react';
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
  /** Cover the player with "Video finished" once it ends (hides YouTube's end screen on the projector). */
  showEnded?: boolean;
  /** Told when the video finishes (true) or starts again (false). */
  onEndedChange?: (ended: boolean) => void;
  className?: string;
}

/** Shows question media: images, YouTube and Drive embeds, linked or local video files. */
export function MediaView({ media, playback, localUrls, muted = false, showEnded, onEndedChange, className }: Props) {
  const player = resolveMedia(media);
  const frame = cn('relative overflow-hidden rounded-[inherit] bg-black/40', className);
  const videoProps = { playback, muted, showEnded, onEndedChange, className: frame };

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
      <VideoMedia src={src} {...videoProps} />
    );
  }

  if (player.player === 'image') return <ImageMedia src={player.src} className={frame} />;
  if (player.player === 'video') return <VideoMedia src={player.src} {...videoProps} />;
  if (player.player === 'youtube') return <YouTubeMedia embedUrl={player.embedUrl} {...videoProps} />;
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

function EndedOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-bg">
      <p className="flex items-center gap-3 text-[clamp(1rem,2vw,2rem)] text-muted">
        <CircleCheck className="size-[1.2em] text-accent" aria-hidden /> Video finished
      </p>
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

interface VideoProps {
  playback?: MediaPlayback;
  muted: boolean;
  showEnded?: boolean;
  onEndedChange?: (ended: boolean) => void;
  className: string;
}

/**
 * Shared playback rules for both players. Live updates arrive constantly (answers, joins), so the
 * player only reacts to real changes: play, pause, or a restart. A finished video stays finished
 * until the organizer restarts it; it is never replayed just because "playing" is still on.
 */
function usePlaybackSync(
  playback: MediaPlayback | undefined,
  ready: boolean,
  actions: { play: () => void; pause: () => void; rewind: () => void },
  onEndedChange?: (ended: boolean) => void,
) {
  const [ended, setEnded] = useState(false);
  const lastRestart = useRef<number | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const playing = playback?.playing ?? false;
  const restartCount = playback?.restartCount ?? 0;
  const controlled = Boolean(playback);

  useEffect(() => {
    if (!ready || !controlled) return;
    const restarted = lastRestart.current !== null && lastRestart.current !== restartCount;
    lastRestart.current = restartCount;
    if (restarted) {
      actionsRef.current.rewind();
      setEnded(false);
    }
    if (playing && (restarted || !ended)) actionsRef.current.play();
    else if (!playing) actionsRef.current.pause();
    // `ended` is deliberately not a dependency: finishing must not trigger anything by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, controlled, playing, restartCount]);

  useEffect(() => onEndedChange?.(ended), [ended, onEndedChange]);

  return { ended, markEnded: () => setEnded(true), markPlaying: () => setEnded(false) };
}

function VideoMedia({ src, playback, muted, showEnded, onEndedChange, className }: VideoProps & { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const { ended, markEnded, markPlaying } = usePlaybackSync(
    playback,
    true,
    {
      play: () =>
        ref.current?.play().then(
          () => setBlocked(false),
          // Browsers block sound until someone clicks the page; offer a click to start.
          () => setBlocked(true),
        ),
      pause: () => ref.current?.pause(),
      rewind: () => {
        if (ref.current) ref.current.currentTime = 0;
      },
    },
    onEndedChange,
  );

  return (
    <div className={className}>
      <video
        ref={ref}
        src={src}
        muted={muted}
        playsInline
        preload="auto"
        controls={!playback}
        onEnded={markEnded}
        onPlaying={markPlaying}
        className="size-full object-contain"
      />
      {showEnded && ended && <EndedOverlay />}
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
  showEnded,
  onEndedChange,
  className,
}: VideoProps & { embedUrl: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const send = (func: string, args: unknown[] = []) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

  const { ended, markEnded, markPlaying } = usePlaybackSync(
    playback,
    loaded,
    {
      play: () => {
        send(muted ? 'mute' : 'unMute');
        send('playVideo');
      },
      pause: () => send('pauseVideo'),
      rewind: () => send('seekTo', [0, true]),
    },
    onEndedChange,
  );

  // Ask the player to report its state, and follow "ended" (0) and "playing" (1).
  useEffect(() => {
    if (!loaded) return;
    const frame = ref.current;
    // The player ignores the handshake until it is ready, so repeat it until the player answers.
    let connected = false;
    let attempts = 0;
    const handshake = () =>
      frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    handshake();
    const retry = setInterval(() => {
      if (connected || ++attempts > 30) clearInterval(retry);
      else handshake();
    }, 1000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame?.contentWindow || typeof event.data !== 'string') return;
      connected = true;
      try {
        const data = JSON.parse(event.data) as { event?: string; info?: unknown };
        const state =
          data.event === 'onStateChange'
            ? data.info
            : data.event === 'infoDelivery' && data.info && typeof data.info === 'object'
              ? (data.info as { playerState?: number }).playerState
              : undefined;
        if (state === 0) markEnded();
        else if (state === 1) markPlaying();
      } catch {
        // Not a player message.
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearInterval(retry);
      window.removeEventListener('message', onMessage);
    };
    // markEnded/markPlaying only set state; one listener per loaded player is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Fixed per video: changing the iframe address would reload the player, so later play/pause
  // changes go through postMessage instead.
  const [src] = useState(() => {
    let url = embedUrl;
    // Controlled by the console: no player controls, keyboard or annotations, which also cuts the
    // moments YouTube overlays the video title (it can't be hidden entirely).
    if (playback) url = url.replace('controls=1', 'controls=0') + '&disablekb=1&iv_load_policy=3&fs=0';
    if (playback?.playing) url += muted ? '&autoplay=1&mute=1' : '&autoplay=1';
    return url;
  });

  return (
    <div className={className}>
      <iframe
        ref={ref}
        src={src}
        title="Question video"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setTimeout(() => setLoaded(true), 600)}
        className={cn('size-full border-0', playback && 'pointer-events-none')}
      />
      {/* After the end, YouTube shows its end screen (title, suggestions); the projector hides it. */}
      {showEnded && ended && <EndedOverlay />}
    </div>
  );
}
