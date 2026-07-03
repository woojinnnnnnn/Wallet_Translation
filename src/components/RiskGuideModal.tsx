import { useEffect } from 'react';

type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

const riskGuideSections: Array<{
  level: RiskLevel;
  label: string;
  description: string;
  triggers: string[];
}> = [
  {
    level: 'low',
    label: 'Low risk',
    description: 'Ordinary value movement — nothing to review.',
    triggers: [
      'A standard incoming or outgoing transfer of ETH or a token.',
      'A swap with both an outgoing and an incoming asset detected.',
    ],
  },
  {
    level: 'medium',
    label: 'Medium risk',
    description: 'You granted some access or the token has a minor caveat — worth a look.',
    triggers: [
      'A token spending approval (approve / increaseAllowance / decreaseAllowance) for a bounded amount.',
      'A signed permit that granted token spending access off-chain.',
      'A high-tax token (over 10%) with meaningful fees on buy or sell.',
      "A token contract whose source code isn't publicly verified.",
    ],
  },
  {
    level: 'high',
    label: 'High risk',
    description: 'A spender could take more than expected, or the token itself looks unsafe.',
    triggers: [
      'An unlimited spending approval — the spender can drain your entire token balance.',
      'An NFT collection-wide approval (setApprovalForAll) — the spender can move any NFT in that collection.',
      "A honeypot token — selling it may be impossible.",
      'A token address flagged as blacklisted.',
      'Transfer restrictions detected on the token — selling may be blocked.',
      'The spender address itself is flagged as malicious.',
      'The counterparty address is flagged as a scam by Blockscout.',
      "A transfer that left your wallet but was executed by another address, not you — likely using an approval you granted earlier.",
      'A token contract whose symbol impersonates the native currency (e.g. an ERC-20 called "ETH") — a common way to disguise a worthless token as a real transfer.',
    ],
  },
  {
    level: 'unknown',
    label: 'Unknown risk',
    description: "Not enough context to classify confidently — check the transaction yourself.",
    triggers: [
      'A contract interaction with no token or ETH movement attached (e.g. a claim/mint/custom function call).',
      'A contract interaction where the wallet is both sender and receiver.',
      "Multiple token movements grouped into one transaction that don't resolve into a single swap.",
    ],
  },
];

export function RiskGuideModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="risk-guide-overlay" onClick={onClose}>
      <div
        className="risk-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Risk level guide"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="risk-guide-header">
          <h2>How risk levels are decided</h2>
          <button
            className="risk-guide-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="risk-guide-intro">
          Every transaction is scored automatically from what's visible on-chain
          (and, for tokens/spenders, third-party security checks). Here's what
          each level means and what triggers it.
        </p>
        <div className="risk-guide-sections">
          {riskGuideSections.map((section) => (
            <div className="risk-guide-section" key={section.level}>
              <div className="risk-guide-section-head">
                <span className={`risk-pill risk-${section.level}`}>{section.label}</span>
                <p>{section.description}</p>
              </div>
              <ul>
                {section.triggers.map((trigger) => (
                  <li key={trigger}>{trigger}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="risk-guide-footnote">
          A dashed <span className="risk-check-incomplete-pill">check incomplete</span> tag
          means the third-party security check for that transaction didn't finish (timeout or
          rate limit) — it isn't the same as "checked, no issues found." Treat those as
          unverified, not safe.
        </p>
      </div>
    </div>
  );
}
