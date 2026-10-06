import { useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { findLocalUrl, type useLocalMedia } from '@/lib/localMedia';
import { cn } from '@/lib/utils';

interface Props {
  /** File names the competition's questions refer to. */
  required: string[];
  media: ReturnType<typeof useLocalMedia>;
}

/**
 * Lets the projector operator pick the media files stored on this computer. Only a count is shown
 * on the big screen; file names appear in the dialog, which is opened before the quiz starts.
 */
export function LocalMediaButton({ required, media }: Props) {
  const [open, setOpen] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const loaded = required.filter((name) => findLocalUrl(media.urls, name)).length;
  const complete = loaded === required.length;

  const pick = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter(
      (f) => /^(video|image)\//.test(f.type) || /\.(mp4|webm|m4v|ogv|mov|png|jpe?g|gif|webp|svg)$/i.test(f.name),
    );
    if (files.length > 0) await media.add(files);
  };

  return (
    <>
      <Button
        variant={complete ? 'secondary' : 'warn'}
        size="lg"
        className={cn('fixed bottom-6 left-6', complete && 'opacity-60 hover:opacity-100')}
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="size-5" aria-hidden /> Media files {loaded}/{required.length}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Media files on this computer"
        description="Some questions play files stored on this projector computer. Choose them once; they stay here after a refresh and are never uploaded."
      >
        <div className="space-y-4">
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-line p-2 text-sm">
            {required.map((name) => {
              const ok = Boolean(findLocalUrl(media.urls, name));
              return (
                <li key={name} className="flex items-center gap-2 px-2 py-1">
                  {ok ? (
                    <CheckCircle2 className="size-4 text-good" aria-label="Loaded" />
                  ) : (
                    <CircleAlert className="size-4 text-warn" aria-label="Missing" />
                  )}
                  <span className={cn('font-mono', !ok && 'text-warn')}>{name}</span>
                </li>
              );
            })}
          </ul>
          <input
            ref={filesInput}
            type="file"
            multiple
            accept="video/*,image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files)}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            // Chrome and Edge let you choose a whole folder.
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => void pick(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => folderInput.current?.click()}>
              <FolderOpen className="size-4" aria-hidden /> Choose folder
            </Button>
            <Button onClick={() => filesInput.current?.click()}>Choose files</Button>
            <Button variant="ghost" className="ml-auto" onClick={() => void media.clear()}>
              <Trash2 className="size-4" aria-hidden /> Forget files
            </Button>
          </div>
          {!media.persistent && (
            <p className="text-xs text-warn">
              This browser can&apos;t keep the files after a refresh (private window?). Choose them again if the page
              reloads.
            </p>
          )}
          <p className="text-xs text-faint">
            File names must match exactly what the questions use. Videos play in the browser: MP4 (H.264) or WebM work
            best.
          </p>
        </div>
      </Dialog>
    </>
  );
}
