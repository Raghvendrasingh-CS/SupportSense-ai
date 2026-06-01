// IncidentAlert — Shows detected incident patterns from correlated tickets
// Displays dismissible orange banners for each active incident

import { useState } from 'react';

export default function IncidentAlert({ incidents = [] }) {
  const [dismissed, setDismissed] = useState(new Set());

  if (!incidents || incidents.length === 0) return null;

  const visible = incidents.filter((_, i) => !dismissed.has(i));
  if (visible.length === 0) return null;

  const handleDismiss = (index) => {
    setDismissed((prev) => new Set([...prev, index]));
  };

  return (
    <div className="space-y-2 mb-4">
      {incidents.map((incident, index) => {
        if (dismissed.has(index)) return null;

        return (
          <div
            key={index}
            className="flex items-start gap-3 p-3 rounded-lg border border-orange-500/30 bg-orange-950/20 animate-in fade-in"
          >
            <span className="text-orange-400 text-lg flex-shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-orange-300">
                  Incident Detected — {incident.category || 'Unknown'}
                </span>
                <span className="text-xs bg-orange-900/40 text-orange-400 px-2 py-0.5 rounded-full font-mono">
                  {incident.ticketCount || 0} tickets
                </span>
                {incident.timeWindowMinutes && (
                  <span className="text-xs text-orange-400/70">
                    in {incident.timeWindowMinutes} min
                  </span>
                )}
              </div>
              {incident.relatedTickets && incident.relatedTickets.length > 0 && (
                <p className="text-xs text-orange-400/60">
                  Related: {incident.relatedTickets.join(', ')}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDismiss(index)}
              className="text-orange-400/50 hover:text-orange-300 transition-colors flex-shrink-0 text-lg leading-none"
              aria-label="Dismiss incident alert"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
