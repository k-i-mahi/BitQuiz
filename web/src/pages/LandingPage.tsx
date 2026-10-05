import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Radio, Smartphone, Timer, Trophy } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LandingPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const joinCode = code.trim().toUpperCase();
    if (joinCode.length === 6) navigate(`/play/${joinCode}`);
  };

  return (
    <div className="grid-lines min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <Link to="/admin/login" className="text-sm font-medium text-muted hover:text-fg">
          Organizer login
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
        <section>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Live quiz arena
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
            Think fast.
            <br />
            <span className="bg-gradient-to-r from-accent to-ieee bg-clip-text text-transparent">Answer faster.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Live quiz competitions, run in real time. Everyone answers from their phone and sees the same question at
            the same moment.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Radio, title: 'Live control', text: 'Organizers run every question from one console.' },
              { icon: Smartphone, title: 'Join in seconds', text: 'Scan the QR code, enter name and roll.' },
              { icon: Timer, title: 'Server-timed', text: 'Every phone counts down to the same deadline.' },
              { icon: Trophy, title: 'Speed scoring', text: 'Correct and fast earns the most points.' },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-line bg-surface/60 p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="self-start rounded-3xl border border-line bg-surface/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <h2 className="text-2xl font-bold">Join a quiz</h2>
          <p className="mt-1 text-sm text-muted">Enter the 6-character code shown on the screen.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              placeholder="K7Q2XM"
              aria-label="Join code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={code.length !== 6}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </section>
      </main>

      <footer className="border-t border-line/60 py-6 text-center text-xs text-faint">
        BitQuiz · Built for IEEE CS KUET
      </footer>
    </div>
  );
}
