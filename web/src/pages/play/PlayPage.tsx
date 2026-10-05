import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { FullPageSpinner } from '@/components/ui/spinner';
import { ApiError, api } from '@/lib/api';
import { JoinForm, type JoinInfo } from './JoinForm';
import { LiveParticipant } from './LiveParticipant';

const tokenKey = (joinCode: string) => `bitquiz:token:${joinCode}`;

function readToken(joinCode: string): string | null {
  try {
    return localStorage.getItem(tokenKey(joinCode));
  } catch {
    return null;
  }
}

function writeToken(joinCode: string, token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(joinCode), token);
    else localStorage.removeItem(tokenKey(joinCode));
  } catch {
    // Private mode without storage: the session simply won't survive a refresh.
  }
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'join'; info: JoinInfo | null; error: string | null }
  | { kind: 'live'; token: string };

export function PlayPage() {
  const { joinCode: rawCode } = useParams<{ joinCode: string }>();
  const joinCode = rawCode?.toUpperCase() ?? '';
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const loadJoinInfo = useCallback(
    async (message: string | null = null) => {
      try {
        const info = await api<JoinInfo>(`/join/${joinCode}`);
        setPhase({ kind: 'join', info, error: message });
      } catch (error) {
        setPhase({
          kind: 'join',
          info: null,
          error:
            error instanceof ApiError && error.status === 404
              ? 'No quiz found with this code.'
              : 'Could not reach the server. Pull to refresh.',
        });
      }
    },
    [joinCode],
  );

  useEffect(() => {
    if (!joinCode) return;
    const token = readToken(joinCode);
    if (!token) {
      void loadJoinInfo();
      return;
    }
    // A returning phone: check the saved token before opening the live connection.
    api('/participant/me', { token })
      .then(() => setPhase({ kind: 'live', token }))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          writeToken(joinCode, null);
          void loadJoinInfo();
        } else {
          // Network trouble: keep the token and let the live connection retry.
          setPhase({ kind: 'live', token });
        }
      });
  }, [joinCode, loadJoinInfo]);

  if (!joinCode) return <Navigate to="/" replace />;
  if (phase.kind === 'checking') return <FullPageSpinner label="Connecting" />;

  if (phase.kind === 'join') {
    return (
      <JoinForm
        joinCode={joinCode}
        info={phase.info}
        initialError={phase.error}
        onJoined={(token) => {
          writeToken(joinCode, token);
          setPhase({ kind: 'live', token });
        }}
      />
    );
  }

  return (
    <LiveParticipant
      token={phase.token}
      onSignedOut={(message) => {
        writeToken(joinCode, null);
        void loadJoinInfo(message);
      }}
    />
  );
}
