import { useEffect, useState } from 'react';

const STORAGE_KEY = 'walletTxViewerBookmarks';

export type Bookmark = { address: string; addedAt: number };

function readBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

// Browser-local only (no backend) — bookmarks live in this browser's
// localStorage, same pattern as the theme preference in useTheme.ts.
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(readBookmarks);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    } catch {
      // Storage unavailable (private browsing, quota) — bookmarks just
      // won't persist across reloads; nothing else in the app depends on them.
    }
  }, [bookmarks]);

  function addBookmark(address: string) {
    setBookmarks((previous) =>
      previous.some((b) => b.address.toLowerCase() === address.toLowerCase())
        ? previous
        : [...previous, { address, addedAt: Date.now() }],
    );
  }

  function removeBookmark(address: string) {
    setBookmarks((previous) =>
      previous.filter((b) => b.address.toLowerCase() !== address.toLowerCase()),
    );
  }

  function isBookmarked(address: string) {
    return bookmarks.some((b) => b.address.toLowerCase() === address.toLowerCase());
  }

  return { addBookmark, bookmarks, isBookmarked, removeBookmark };
}
