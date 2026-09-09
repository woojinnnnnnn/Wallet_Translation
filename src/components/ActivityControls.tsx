import { useEffect, useRef, useState } from 'react';
import type { Chain } from 'viem';
import { activityRanges } from '../constants/activityRanges';
import {
  getChainSymbol,
  mainnetChains,
  testnetChains,
  type SupportedChainId,
} from '../constants/chains';
import { typeFilters } from '../constants/typeFilters';
import type { ChainHealthStatus } from '../services/chainHealthService';
import type { ActivityRange, TransactionTypeFilter } from '../types/activity';

const CHAIN_HEALTH_LABEL: Record<ChainHealthStatus, string> = {
  ok: 'API responding normally',
  slow: 'API responding slowly',
  down: 'API not responding',
};

function chainHealthLabel(status?: ChainHealthStatus) {
  return status ? CHAIN_HEALTH_LABEL[status] : 'Checking API status…';
}

function ChainHealthDot({ status }: { status?: ChainHealthStatus }) {
  return (
    <span
      className={`chain-health-dot chain-health-${status ?? 'checking'}`}
      aria-hidden="true"
      title={chainHealthLabel(status)}
    />
  );
}

// The dot is color-only and its title tooltip never shows on touch — this
// keeps the status in the button's accessible name (after the chain name,
// so it reads "Ethereum ETH — API responding normally" in that order) for
// screen readers and anyone else who can't rely on hover or color alone.
function ChainHealthLabel({ status }: { status?: ChainHealthStatus }) {
  return <span className="sr-only">{` — ${chainHealthLabel(status)}`}</span>;
}

export function ActivityControls({
  activityRange,
  activeChain,
  chainHealth,
  isConnected,
  isSwitchingChain,
  onRangeChange,
  onSwitchChain,
  onTypeFilterChange,
  typeFilter,
}: {
  activityRange: ActivityRange;
  activeChain?: Chain;
  chainHealth?: Record<number, ChainHealthStatus>;
  isConnected: boolean;
  isSwitchingChain: boolean;
  onRangeChange: (range: ActivityRange) => void;
  onSwitchChain: (chainId: SupportedChainId) => void;
  onTypeFilterChange: (filter: TransactionTypeFilter) => void;
  typeFilter: TransactionTypeFilter;
}) {
  const isOnTestnet = testnetChains.some((c) => c.id === activeChain?.id);
  const [showTestnet, setShowTestnet] = useState(false);
  const displayTestnet = showTestnet || isOnTestnet;

  // Sticky elevation — becomes true when the switcher is pinned at top
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
    <div ref={sentinelRef} className="chain-switcher-sentinel" aria-hidden="true" />
    <section className={`chain-switcher${isStuck ? ' chain-switcher-stuck' : ''}`} aria-label="chain switcher">
      <div className="switcher-group">
        <span>Network</span>
        <div className="switcher-network-column">
          <div className="switcher-options">
            {mainnetChains.map((chain) => (
              <button
                className={activeChain?.id === chain.id ? 'chain-option chain-option-active' : 'chain-option'}
                type="button"
                key={chain.id}
                onClick={() => onSwitchChain(chain.id)}
                disabled={!isConnected || isSwitchingChain}
              >
                <ChainHealthDot status={chainHealth?.[chain.id]} />
                <span>{chain.name}</span>
                <small>{getChainSymbol(chain.id)}</small>
                <ChainHealthLabel status={chainHealth?.[chain.id]} />
              </button>
            ))}
            <div className="testnet-divider" />
            <button
              className={displayTestnet ? 'chain-option testnet-toggle testnet-toggle-active' : 'chain-option testnet-toggle'}
              type="button"
              onClick={() => setShowTestnet((v) => !v)}
              disabled={!isConnected || isSwitchingChain || isOnTestnet}
              title={isOnTestnet ? 'Connected to a testnet — testnet chains stay visible' : undefined}
              aria-expanded={displayTestnet}
            >
              Testnet
            </button>
          </div>
          {/* Testnet chips live in their own row instead of wrapping inline
              with the mainnet chips above — that lets this reveal animate a
              clean height change (0fr -> 1fr) instead of an unpredictable
              flex-wrap reflow, which is what made an earlier attempt at
              animating this feel janky. Always rendered (not conditionally)
              so there's something to transition from/to; aria-hidden +
              tabIndex do the a11y hiding work the CSS collapse doesn't. */}
          <div
            className={`testnet-reveal${displayTestnet ? ' testnet-reveal-open' : ''}`}
            aria-hidden={!displayTestnet}
          >
            <div className="testnet-reveal-inner">
              {testnetChains.map((chain) => (
                <button
                  className={activeChain?.id === chain.id ? 'chain-option chain-option-active' : 'chain-option'}
                  type="button"
                  key={chain.id}
                  onClick={() => onSwitchChain(chain.id)}
                  disabled={!isConnected || isSwitchingChain}
                  tabIndex={displayTestnet ? undefined : -1}
                >
                  <ChainHealthDot status={chainHealth?.[chain.id]} />
                  <span>{chain.name}</span>
                  <small>{getChainSymbol(chain.id)}</small>
                  <ChainHealthLabel status={chainHealth?.[chain.id]} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="switcher-filters">
        <div className="switcher-group range-group">
          <span>Time range</span>
          <div className="switcher-options compact-options">
            {activityRanges.map((range) => (
              <button
                className={activityRange === range.value ? 'range-option range-option-active' : 'range-option'}
                key={range.value}
                type="button"
                onClick={() => onRangeChange(range.value)}
                title={range.hint}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        <div className="switcher-group range-group">
          <span>Type</span>
          <div className="switcher-options compact-options">
            {typeFilters.map((filter) => (
              <button
                className={typeFilter === filter.value ? 'range-option range-option-active' : 'range-option'}
                key={filter.value}
                type="button"
                onClick={() => onTypeFilterChange(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
    </>
  );
}
