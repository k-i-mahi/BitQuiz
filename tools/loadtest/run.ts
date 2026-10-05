/**
 * BitQuiz load test: one scripted Game Master plus N simulated phones against a running server.
 *
 *   npm run loadtest -- --url http://localhost:3000 --email admin@x --password secret --players 300 --questions 5
 *
 * It creates a throwaway competition, has every bot join and answer at a random moment,
 * then reports how fast state changes reached the phones and whether any answer was lost.
 * The competition is archived at the end; delete it from the admin UI if you like.
 */
import { parseArgs } from 'node:util';
import { io, type Socket } from 'socket.io-client';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.LOADTEST_URL ?? 'http://localhost:3000' },
    email: { type: 'string', default: process.env.SEED_ADMIN_EMAIL },
    password: { type: 'string', default: process.env.SEED_ADMIN_PASSWORD },
    players: { type: 'string', default: '300' },
    questions: { type: 'string', default: '5' },
    seconds: { type: 'string', default: '8' },
  },
});

const base = values.url!.replace(/\/$/, '');
const PLAYERS = Number(values.players);
const QUESTIONS = Number(values.questions);
const SECONDS = Math.max(5, Number(values.seconds));

let cookie = '';

async function http<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-BitQuiz-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

interface Snapshot {
  revision: number;
  competition: { status: string };
  question: { id: string; status: string; options: Array<{ id: string }> } | null;
}

interface Bot {
  roll: string;
  token: string;
  socket: Socket;
  answered: Set<string>;
  accepted: number;
  rejected: number;
}

const percentile = (list: number[], p: number) => {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

async function main() {
  if (!values.email || !values.password) throw new Error('Pass --email and --password of an admin account');
  console.log(`BitQuiz load test → ${base}: ${PLAYERS} players, ${QUESTIONS} questions, ${SECONDS}s each`);

  await http('/auth/login', { method: 'POST', body: { email: values.email, password: values.password } });
  const { id } = await http<{ id: string }>('/competitions', {
    method: 'POST',
    body: { title: `Load test ${new Date().toISOString().slice(0, 16)}` },
  });

  const header = 'round,order,question,option_a,option_b,option_c,option_d,correct,time_limit';
  const rows = Array.from(
    { length: QUESTIONS },
    (_, i) => `1,${i + 1},Load test question ${i + 1}?,w,x,y,z,B,${SECONDS}`,
  );
  await http(`/competitions/${id}/import`, {
    method: 'POST',
    body: { csv: [header, ...rows].join('\n'), mode: 'replace' },
  });
  await http(`/competitions/${id}`, {
    method: 'PATCH',
    body: { title: 'Load test', rollMinLength: 4, rollMaxLength: 10, rollDigitsOnly: true, allowLateJoin: true },
  });

  const detail = await http<{ joinCode: string; revision: number }>(`/competitions/${id}`);
  const command = async (body: Record<string, unknown>) => {
    const { revision } = await http<{ revision: number }>(`/competitions/${id}`);
    return http(`/competitions/${id}/commands`, { method: 'POST', body: { ...body, revision } });
  };
  await command({ type: 'OPEN_LOBBY' });

  // --- Join ---------------------------------------------------------------------------------
  const joinStart = Date.now();
  const bots: Bot[] = [];
  const delivery = new Map<string, number[]>(); // event label → delays (ms)
  const sentAt = new Map<string, number>();
  let socketErrors = 0;

  await Promise.all(
    Array.from({ length: PLAYERS }, async (_, i) => {
      const roll = String(9_000_000 + i);
      await new Promise((r) => setTimeout(r, Math.random() * 3000)); // people don't all tap at once
      const { token } = await http<{ token: string }>('/join', {
        method: 'POST',
        body: { joinCode: detail.joinCode, name: `Bot ${i + 1}`, roll },
      });
      const socket = io(base, { auth: { role: 'participant', token }, transports: ['websocket'], forceNew: true });
      const bot: Bot = { roll, token, socket, answered: new Set(), accepted: 0, rejected: 0 };
      socket.on('connect_error', () => socketErrors++);
      socket.on('lping', (_t: number, ack?: () => void) => ack?.());
      socket.on('state', (state: Snapshot) => {
        const q = state.question;
        const label = q ? `${q.id}:${q.status}` : `none:${state.competition.status}`;
        const sent = sentAt.get(label);
        if (sent !== undefined) {
          const list = delivery.get(label) ?? [];
          if (list.length < PLAYERS) list.push(Date.now() - sent);
          delivery.set(label, list);
        }
        if (q?.status === 'OPEN' && !bot.answered.has(q.id)) {
          bot.answered.add(q.id);
          const option = q.options[Math.floor(Math.random() * q.options.length)]!.id;
          setTimeout(
            async () => {
              try {
                await http('/answers', {
                  method: 'POST',
                  token,
                  body: { questionId: q.id, optionId: option, clientRequestId: `lt-${roll}-${q.id}` },
                });
                bot.accepted++;
              } catch {
                bot.rejected++;
              }
            },
            Math.random() * (SECONDS - 1.5) * 1000,
          );
        }
      });
      bots.push(bot);
    }),
  );
  await new Promise((r) => setTimeout(r, 1500));
  const connected = bots.filter((b) => b.socket.connected).length;
  console.log(
    `Joined ${bots.length} players in ${((Date.now() - joinStart) / 1000).toFixed(1)}s, ${connected} connected`,
  );

  // --- Run ------------------------------------------------------------------------------------
  await command({ type: 'START' });
  const questionIds: string[] = [];
  for (let n = 0; n < QUESTIONS; n++) {
    const pending = (
      await http<{ rounds: Array<{ questions: Array<{ id: string; status: string }> }> }>(`/competitions/${id}`)
    ).rounds
      .flatMap((r) => r.questions)
      .find((q) => q.status === 'PENDING')!;
    questionIds.push(pending.id);
    sentAt.set(`${pending.id}:OPEN`, Date.now());
    await command({ type: 'OPEN_QUESTION' });
    await new Promise((r) => setTimeout(r, SECONDS * 1000 + 2000)); // auto-close after deadline + grace
    sentAt.set(`${pending.id}:REVEALED`, Date.now());
    await command({ type: 'REVEAL' });
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write(`  question ${n + 1}/${QUESTIONS} done\n`);
  }
  await command({ type: 'FINISH' });

  // --- Verify ---------------------------------------------------------------------------------
  const board = await http<{ rows: Array<{ correct: number; wrong: number }> }>(`/competitions/${id}/leaderboard`);
  const storedAnswers = board.rows.reduce((sum, r) => sum + r.correct + r.wrong, 0);
  const accepted = bots.reduce((sum, b) => sum + b.accepted, 0);
  const rejected = bots.reduce((sum, b) => sum + b.rejected, 0);
  const allDelays = [...delivery.values()].flat();

  console.log('\nResults');
  console.log(
    `  State delivery to phones: p50 ${percentile(allDelays, 50)} ms, p95 ${percentile(allDelays, 95)} ms, max ${percentile(allDelays, 100)} ms (${allDelays.length} samples)`,
  );
  for (const qid of questionIds) {
    const open = delivery.get(`${qid}:OPEN`)?.length ?? 0;
    if (open < connected) console.log(`  ! only ${open}/${connected} phones saw question ${qid} open`);
  }
  console.log(`  Answers: ${accepted} accepted, ${rejected} rejected, ${storedAnswers} stored in the database`);
  console.log(`  Socket connection errors: ${socketErrors}`);

  const p95 = percentile(allDelays, 95);
  const pass = accepted === storedAnswers && rejected === 0 && p95 <= 1000 && socketErrors === 0;
  console.log(pass ? '\nPASS' : '\nFAIL');

  bots.forEach((b) => b.socket.disconnect());
  await http(`/competitions/${id}/archive`, { method: 'POST' }).catch(() => undefined);
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
