import { useDeferredValue } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  driveFileId,
  mediaProblem,
  parseMediaLink,
  youtubeId,
  type MediaKind,
  type MediaSource,
} from '@bitquiz/shared';
import { MediaView } from '@/components/MediaView';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  kind: MediaKind | '';
  source: MediaSource;
  mediaRef: string;
  onPhones: boolean;
  onKind: (kind: MediaKind | '') => void;
  onSource: (source: MediaSource) => void;
  onRef: (ref: string) => void;
  onPhonesChange: (value: boolean) => void;
}

/** Media section of the question editor: type, where it comes from, link or file name, preview. */
export function MediaFields({ kind, source, mediaRef, onPhones, onKind, onSource, onRef, onPhonesChange }: Props) {
  const deferredRef = useDeferredValue(mediaRef.trim());
  const problem = kind && deferredRef ? mediaProblem({ kind, source, ref: deferredRef }) : null;
  const canShowOnPhones = kind === 'IMAGE' && source === 'LINK';
  // YouTube and Drive players display the title or file name; warn because it may reveal the answer.
  const link = kind === 'VIDEO' && source === 'LINK' && !problem ? parseMediaLink(deferredRef) : null;
  const titleHost = link ? (youtubeId(link) ? 'YouTube' : driveFileId(link) ? 'Google Drive' : null) : null;

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="media-kind">Media</Label>
          <Select
            id="media-kind"
            value={kind}
            onChange={(e) => onKind(e.target.value as MediaKind | '')}
            className="w-40"
          >
            <option value="">None</option>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
          </Select>
        </div>
        {kind && (
          <fieldset className="flex flex-wrap gap-4 pb-2.5 text-sm">
            <legend className="sr-only">Where the media comes from</legend>
            {(
              [
                ['LINK', 'Link (YouTube, Google Drive, https://…)'],
                ['LOCAL', 'File on the projector computer'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="media-source"
                  checked={source === value}
                  onChange={() => onSource(value)}
                  className="accent-[var(--color-accent)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {kind && (
        <>
          <div>
            <Input
              value={mediaRef}
              onChange={(e) => onRef(e.target.value)}
              placeholder={
                source === 'LINK'
                  ? kind === 'VIDEO'
                    ? 'https://youtu.be/… or a Google Drive / .mp4 link'
                    : 'https://… image link'
                  : kind === 'VIDEO'
                    ? 'round2-q1.mp4'
                    : 'round2-q1.png'
              }
              aria-label={source === 'LINK' ? 'Media link' : 'File name'}
              aria-invalid={Boolean(problem)}
            />
            <FieldError>{problem}</FieldError>
            <p className="mt-1.5 text-xs text-faint">
              {source === 'LINK'
                ? kind === 'VIDEO'
                  ? 'Tip: upload to YouTube as "Unlisted". Drive files must be shared as "Anyone with the link".'
                  : 'The image must be publicly reachable. Drive images must be shared as "Anyone with the link".'
                : 'At the event, open the projector and choose this file under "Media files". Use neutral names (e.g. round2-q1.mp4): they can hint at the answer.'}
            </p>
          </div>

          {canShowOnPhones && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={onPhones}
                onChange={(e) => onPhonesChange(e.target.checked)}
              />
              Also show this image on participants&apos; phones
            </label>
          )}
          {kind === 'VIDEO' && (
            <p className="text-xs text-muted">
              Videos play on the projector only; phones show &quot;Watch the screen&quot;. Showing the question first
              plays the video alone; the question and options appear when you show them, and the timer starts when you
              open answering.
            </p>
          )}
          {titleHost && (
            <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {titleHost} shows the video&apos;s title on the projector, which can give away the answer. Use a video
                you uploaded with a neutral title (e.g. &quot;Round 2 Q1&quot;), or choose &quot;File on the projector
                computer&quot;, which shows no title.
              </span>
            </p>
          )}

          {deferredRef && !problem && (
            <MediaView
              key={`${kind}-${source}-${deferredRef}`}
              media={{ kind, source, ref: deferredRef, onPhones }}
              className={cn('w-full rounded-lg border border-line', 'aspect-video max-h-56')}
            />
          )}
        </>
      )}
    </div>
  );
}
