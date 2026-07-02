import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { shortenAddress } from '../utils/format';

export function AddressLookup({
  activeAddress,
  onClear,
  onLookup,
}: {
  activeAddress: string | null;
  onClear: () => void;
  onLookup: (address: string) => void;
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
        <span className="address-lookup-label">Look up any address</span>
        <input
          className="address-lookup-input"
          onChange={(event) => setValue(event.target.value)}
          placeholder="0x..."
          spellCheck={false}
          type="text"
          value={value}
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
      {error && <p className="address-lookup-error">{error}</p>}
      {activeAddress && (
        <p className="address-lookup-active">
          Viewing <strong>{shortenAddress(activeAddress)}</strong> — read-only,
          not connected to this address
        </p>
      )}
    </section>
  );
}
