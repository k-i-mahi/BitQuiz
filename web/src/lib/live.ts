import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type AnyState, type ParticipantMe } from '@bitquiz/shared';
import { ServerClock } from './clock';

export type LiveAuth =
  | { role: 'gm'; competitionId: string }
  | { role: 'screen'; token: string }
  | { role: 'participant'; token: string };

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'denied';

export interface LiveState<S extends AnyState> {
  state: S | null;
  me: (ParticipantMe & { revision: number }) | null;
  status: ConnectionStatus;
  kicked: 'kicked' | 'reset' | null;
  clock: ServerClock;
}

/**
 * Subscribes to the server's live state. The server pushes a full snapshot on connect and
 * after every change, so refreshing or reconnecting always restores the right screen.
 */
export function useLive<S extends AnyState>(auth: LiveAuth | null): LiveState<S> {
  const clock = useRef(new ServerClock()).current;
  const [state, setState] = useState<S | null>(null);
  const [me, setMe] = useState<LiveState<S>['me']>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [kicked, setKicked] = useState<LiveState<S>['kicked']>(null);
  const key = auth ? JSON.stringify(auth) : null;

  useEffect(() => {
    if (!key) return;
    const socket: Socket = io({
      auth: JSON.parse(key) as LiveAuth,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });

    let lastRevision = -1;
    let lastMeRevision = -1;

    const syncClock = () => {
      const sentAt = Date.now();
      socket.timeout(4000).emit(SOCKET_EVENTS.time, (err: Error | null, serverNow: number) => {
        if (!err) clock.fromPing(sentAt, serverNow, Date.now());
      });
    };

    socket.on('connect', () => {
      setStatus('online');
      for (let i = 0; i < 3; i++) setTimeout(syncClock, i * 400);
    });
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', (error) => {
      setStatus(error.message === 'unauthorized' ? 'denied' : 'offline');
      if (error.message === 'unauthorized') socket.disconnect();
    });

    socket.on(SOCKET_EVENTS.state, (next: S) => {
      // Ignore anything older than what is already on screen.
      if (next.revision < lastRevision) return;
      lastRevision = next.revision;
      clock.fromSnapshot(next.serverNow);
      setState(next);
    });

    socket.on(SOCKET_EVENTS.me, (next: ParticipantMe & { revision: number }) => {
      if (next.revision < lastMeRevision) return;
      lastMeRevision = next.revision;
      setMe(next);
    });

    socket.on(SOCKET_EVENTS.kicked, (payload: { reason: 'kicked' | 'reset' }) => setKicked(payload.reason));

    // Latency probe from the server; answering promptly lets it compensate for slow networks.
    socket.on(SOCKET_EVENTS.latencyPing, (_sentAt: number, ack?: () => void) => ack?.());

    const interval = setInterval(syncClock, 30_000);
    return () => {
      clearInterval(interval);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [key, clock]);

  return { state, me, status, kicked, clock };
}

/** Re-renders at the given interval; used for countdowns. */
export function useTicker(intervalMs: number, active = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return tick;
}
