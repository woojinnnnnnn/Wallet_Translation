import { useEffect, useRef, useState } from 'react';
import type { Chain } from 'viem';
import { activityRanges } from '../constants/activityRanges';
import {
  getChainSymbol,
  mainnetChains,
  testnetChains,
  type SupportedChainId,
} from '../constants/chains';
import type { ChainHealthStatus } from '../services/chainHealthService';
import type { ActivityRange } from '../types/activity';

const CHAIN_HEALTH_LABEL: Record<ChainHealthStatus, string> = {
  ok: 'API responding normally',
  slow: 'API responding slowly',
  down: 'API not responding',
};

function ChainHealthDot({ status }: { status?: ChainHealthStatus }) {
  return (
    <span
      className={`chain-health-dot chain-health-${status ?? 'checking'}`}
      aria-hidden="true"
      title={status ? CHAIN_HEALTH_LABEL[status] : 'Checking API status…'}
    />
  );
}

export function ActivityControls({
  activityRange,
  activeChain,
  chainHealth,
  isConnected,
  isSwitchingChain,
  onRangeChange,
  onSwitchChain,
}: {
  activityRange: ActivityRange;
  activeChain?: Chain;
  chainHealth?: Record<number, ChainHealthStatus>;
  isConnected: boolean;
  isSwitchingChain: boolean;
  onRangeChange: (range: ActivityRange) => void;
  onSwitchChain: (chainId: SupportedChainId) => void;
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
            </button>
          ))}
          <div className="testnet-divider" />
          <button
            className={displayTestnet ? 'chain-option testnet-toggle testnet-toggle-active' : 'chain-option testnet-toggle'}
            type="button"
            onClick={() => setShowTestnet((v) => !v)}
            disabled={!isConnected || isSwitchingChain || isOnTestnet}
            title={isOnTestnet ? 'Connected to a testnet — testnet chains stay visible' : undefined}
          >
            Testnet
          </button>
          {displayTestnet &&
            testnetChains.map((chain) => (
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
              </button>
            ))}
        </div>
      </div>
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
    </section>
    </>
  );
}
