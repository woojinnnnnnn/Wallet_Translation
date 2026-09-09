import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import type { Bookmark } from '../hooks/useBookmarks';
import { shortenAddress } from '../utils/format';

export function AddressLookup({
  activeAddress,
  bookmarks,
  isBookmarked,
  onAddBookmark,
  onClear,
  onLookup,
  onRemoveBookmark,
}: {
  activeAddress: string | null;
  bookmarks: Bookmark[];
  isBookmarked: (address: string) => boolean;
  onAddBookmark: (address: string) => void;
  onClear: () => void;
  onLookup: (address: string) => void;
  onRemoveBookmark: (address: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    if (!isAddress(trimmed)) {
      setError('Enter a valid 0x address');
      return;
    }

    setError(null);
    onLookup(trimmed);
  }

  function handleClear() {
    setValue('');
    setError(null);
    onClear();
  }

  return (
    <section className="address-lookup" aria-label="look up any address">
      <form className="address-lookup-form" onSubmit={handleSubmit}>
        <label className="address-lookup-label" htmlFor="address-lookup-input">
          Look up any address
        </label>
        <input
          id="address-lookup-input"
          className="address-lookup-input"
          onChange={(event) => setValue(event.target.value)}
          placeholder="0x..."
          spellCheck={false}
          type="text"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'address-lookup-error' : undefined}
        />
        <button className="address-lookup-submit" type="submit">
          View
        </button>
        {activeAddress && (
          <button className="address-lookup-clear" onClick={handleClear} type="button">
            Back to my wallet
          </button>
        )}
      </form>
      {error && (
        <p className="address-lookup-error" id="address-lookup-error" role="alert">
          {error}
        </p>
      )}
      {activeAddress && (
        <p className="address-lookup-active">
          Viewing <strong>{shortenAddress(activeAddress)}</strong> — read-only,
          not connected to this address
          <button
            className="bookmark-toggle"
            type="button"
            onClick={() =>
              isBookmarked(activeAddress)
                ? onRemoveBookmark(activeAddress)
                : onAddBookmark(activeAddress)
            }
            aria-label={isBookmarked(activeAddress) ? 'Remove bookmark' : 'Bookmark this address'}
            title={isBookmarked(activeAddress) ? 'Remove bookmark' : 'Bookmark this address'}
          >
            {isBookmarked(activeAddress) ? '★' : '☆'}
          </button>
        </p>
      )}
      {bookmarks.length > 0 && (
        <div className="bookmark-list" aria-label="bookmarked addresses">
          {bookmarks.map((bookmark) => (
            <span className="bookmark-chip" key={bookmark.address}>
              <button
                className="bookmark-chip-address"
                type="button"
                onClick={() => onLookup(bookmark.address)}
              >
                {shortenAddress(bookmark.address)}
              </button>
              <button
                className="bookmark-chip-remove"
                type="button"
                onClick={() => onRemoveBookmark(bookmark.address)}
                aria-label={`Remove bookmark ${bookmark.address}`}
                title="Remove bookmark"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
