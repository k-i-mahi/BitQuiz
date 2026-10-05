import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

/** QR code for a join link, rendered locally (no external service). */
export function JoinQr({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#070b16', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [url]);

  return (
    <div className={cn('shrink-0 rounded-xl bg-white p-2', className)}>
      {src ? <img src={src} alt={`QR code for ${url}`} className="size-full" /> : <div className="size-full" />}
    </div>
  );
}
