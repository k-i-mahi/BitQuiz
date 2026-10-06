import { useCallback, useEffect, useState } from 'react';

/**
 * Media files chosen on the projector computer. They are kept in this browser's IndexedDB so a
 * refresh doesn't lose them, and never leave the computer (nothing is uploaded).
 */
const DB_NAME = 'bitquiz-media';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const files = new Map<string, Blob>();
    const tx = db.transaction(STORE, 'readonly');
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      files.set(String(c.key), c.value as Blob);
      c.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve(files);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function writeAll(files: File[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const file of files) tx.objectStore(STORE).put(file, file.name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function clearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Maps file names to playable blob: URLs; file names are matched case-insensitively. */
export type LocalMediaUrls = Map<string, string>;

export function findLocalUrl(urls: LocalMediaUrls, fileName: string): string | undefined {
  return urls.get(fileName.toLowerCase());
}

export function useLocalMedia() {
  const [urls, setUrls] = useState<LocalMediaUrls>(new Map());
  const [persistent, setPersistent] = useState(true);

  const publish = useCallback((files: Map<string, Blob>) => {
    setUrls((previous) => {
      previous.forEach((url) => URL.revokeObjectURL(url));
      const next: LocalMediaUrls = new Map();
      files.forEach((blob, name) => next.set(name.toLowerCase(), URL.createObjectURL(blob)));
      return next;
    });
  }, []);

  useEffect(() => {
    readAll()
      .then(publish)
      .catch(() => setPersistent(false));
  }, [publish]);

  const add = useCallback(
    async (files: File[]) => {
      try {
        await writeAll(files);
        publish(await readAll());
      } catch {
        // Private windows or full storage: keep the files for this session only.
        setPersistent(false);
        const current = new Map<string, Blob>();
        files.forEach((f) => current.set(f.name, f));
        publish(current);
      }
    },
    [publish],
  );

  const clear = useCallback(async () => {
    await clearAll().catch(() => undefined);
    publish(new Map());
  }, [publish]);

  return { urls, add, clear, persistent };
}
