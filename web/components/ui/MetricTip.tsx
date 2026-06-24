'use client'

/** Accessible metric label with a hover/focus tooltip carrying the metric's
 *  definition (from `Metric.tooltip`). */
export function MetricTip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="metric-tip" tabIndex={0}>
      {label}
      <span className="metric-tip-pop" role="tooltip">
        {tip}
      </span>
      <style jsx>{`
        .metric-tip {
          position: relative;
          cursor: help;
          border-bottom: 1px dotted var(--faint);
          font-family: var(--mono);
          font-size: 0.78rem;
          white-space: nowrap;
        }
        .metric-tip-pop {
          position: absolute;
          bottom: 140%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          width: max-content;
          max-width: 260px;
          white-space: normal;
          padding: 0.55rem 0.7rem;
          border-radius: 10px;
          background: var(--glass-bg-2);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          border: 1px solid var(--border);
          box-shadow: var(--glass-shadow);
          color: var(--ink);
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 0.78rem;
          line-height: 1.4;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.18s ease, transform 0.18s ease;
          z-index: 30;
        }
        .metric-tip:hover .metric-tip-pop,
        .metric-tip:focus .metric-tip-pop,
        .metric-tip:focus-visible .metric-tip-pop {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `}</style>
    </span>
  )
}
