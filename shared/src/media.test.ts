import { describe, expect, it } from 'vitest';
import { localMediaFiles, mediaProblem, resolveMedia } from './media';
import { questionSchema } from './schemas';

describe('resolveMedia', () => {
  it('embeds YouTube links privately from every common link shape', () => {
    for (const ref of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
    ]) {
      const player = resolveMedia({ kind: 'VIDEO', source: 'LINK', ref });
      expect(player).toMatchObject({ player: 'youtube' });
      expect(player?.player === 'youtube' && player.embedUrl).toMatch(
        /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*enablejsapi=1.*rel=0/,
      );
    }
  });

  it('keeps a YouTube start time', () => {
    const player = resolveMedia({ kind: 'VIDEO', source: 'LINK', ref: 'https://youtu.be/dQw4w9WgXcQ?t=42' });
    expect(player?.player === 'youtube' && player.embedUrl).toContain('start=42');
  });

  it('embeds Google Drive videos and serves Drive images directly', () => {
    const share = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing';
    expect(resolveMedia({ kind: 'VIDEO', source: 'LINK', ref: share })).toEqual({
      player: 'drive-video',
      embedUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/preview',
    });
    expect(resolveMedia({ kind: 'IMAGE', source: 'LINK', ref: share })).toEqual({
      player: 'image',
      src: 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv',
    });
  });

  it('plays other links natively and local files from the projector', () => {
    expect(resolveMedia({ kind: 'VIDEO', source: 'LINK', ref: 'https://example.com/a.mp4' })).toEqual({
      player: 'video',
      src: 'https://example.com/a.mp4',
    });
    expect(resolveMedia({ kind: 'IMAGE', source: 'LOCAL', ref: 'q1.png' })).toEqual({
      player: 'local',
      fileName: 'q1.png',
      kind: 'IMAGE',
    });
  });
});

describe('mediaProblem', () => {
  it('only accepts https links', () => {
    expect(mediaProblem({ kind: 'IMAGE', source: 'LINK', ref: 'http://example.com/a.png' })).toMatch(/https/);
    expect(mediaProblem({ kind: 'IMAGE', source: 'LINK', ref: 'javascript:alert(1)' })).toMatch(/https/);
    expect(mediaProblem({ kind: 'IMAGE', source: 'LINK', ref: 'https://example.com/a.png' })).toBeNull();
  });

  it('rejects a YouTube link used as an image', () => {
    expect(mediaProblem({ kind: 'IMAGE', source: 'LINK', ref: 'https://youtu.be/dQw4w9WgXcQ' })).toMatch(/video/);
  });

  it('wants plain file names with a matching extension for local files', () => {
    expect(mediaProblem({ kind: 'VIDEO', source: 'LOCAL', ref: 'videos/q1.mp4' })).toMatch(/only the file name/);
    expect(mediaProblem({ kind: 'VIDEO', source: 'LOCAL', ref: 'q1.png' })).toMatch(/must end with/);
    expect(mediaProblem({ kind: 'VIDEO', source: 'LOCAL', ref: 'Q1.MP4' })).toBeNull();
  });
});

describe('question media validation', () => {
  const base = {
    order: 1,
    prompt: 'Which algorithm?',
    code: null,
    codeLanguage: null,
    options: [
      { id: 'A', text: 'x' },
      { id: 'B', text: 'y' },
    ],
    correctOptionId: 'A',
    explanation: null,
    timeLimitSec: null,
    maxPoints: null,
    minPoints: null,
  };

  it('treats media as optional', () => {
    expect(questionSchema.parse(base)).toMatchObject({ mediaKind: null, mediaOnPhones: false });
  });

  it('requires all media fields together', () => {
    expect(questionSchema.safeParse({ ...base, mediaKind: 'VIDEO' }).success).toBe(false);
  });

  it('only shows linked images on phones', () => {
    const local = { ...base, mediaKind: 'IMAGE', mediaSource: 'LOCAL', mediaRef: 'q1.png', mediaOnPhones: true };
    expect(questionSchema.safeParse(local).success).toBe(false);
    const link = { ...local, mediaSource: 'LINK', mediaRef: 'https://example.com/q1.png' };
    expect(questionSchema.safeParse(link).success).toBe(true);
  });
});

describe('localMediaFiles', () => {
  it('lists each projector file once, sorted', () => {
    expect(
      localMediaFiles([
        { source: 'LOCAL', ref: 'b.mp4' },
        { source: 'LINK', ref: 'https://x.com/a.png' },
        { source: 'LOCAL', ref: 'a.png' },
        { source: 'LOCAL', ref: 'b.mp4' },
      ]),
    ).toEqual(['a.png', 'b.mp4']);
  });
});
