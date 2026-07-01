import type { Chain } from 'viem';
import { activityRanges } from '../constants/activityRanges';
import {
  getChainSymbol,
  supportedChains,
  type SupportedChainId,
} from '../constants/chains';
import type { ActivityRange } from '../types/activity';

export function ActivityControls({
  activityRange,
  activeChain,
  isConnected,
  isSwitchingChain,
  onRangeChange,
  onSwitchChain,
}: {
  activityRange: ActivityRange;
  activeChain?: Chain;
  isConnected: boolean;
  isSwitchingChain: boolean;
  onRangeChange: (range: ActivityRange) => void;
  onSwitchChain: (chainId: SupportedChainId) => void;
}) {
  return (
    <section className="chain-switcher" aria-label="chain switcher">
      <div className="switcher-group">
        <span>Network</span>
        <div className="switcher-options">
          {supportedChains.map((supportedChain) => (
            <button
              className={activeChain?.id === supportedChain.id ? 'chain-option chain-option-active' : 'chain-option'}
              type="button"
              key={supportedChain.id}
              onClick={() => onSwitchChain(supportedChain.id)}
              disabled={!isConnected || isSwitchingChain}
            >
              <span>{supportedChain.name}</span>
              <small>{getChainSymbol(supportedChain.id)}</small>
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
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
