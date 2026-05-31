// CustomerHistoryPanel — Shows repeat customer warning with previous ticket history
// This is the key differentiator — AI remembers customers across sessions

import React from 'react';

/**
 * Calculates a human-readable relative duration string (e.g. 2d ago or 3mo ago).
 * @param {string} dateString ISO string timestamp
 * @returns {string} Relative time ago
 */
function timeAgo(dateString) {
  try {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = diffMs / 1000;
    const diffMin = diffSec / 60;
    const diffHours = diffMin / 60;
    const diffDays = diffHours / 24;
    const diffMonths = diffDays / 30;
    const diffYears = diffDays / 365;

    if (diffHours < 24) {
      const h = Math.floor(diffHours);
      return `${h || 1}h ago`;
    } else if (diffDays < 30) {
      const d = Math.floor(diffDays);
      return `${d}d ago`;
    } else if (diffMonths < 12) {
      const mo = Math.floor(diffMonths);
      return `${mo}mo ago`;
    } else {
      const y = Math.floor(diffYears);
      return `${y}y ago`;
    }
  } catch (error) {
    return '';
  }
}

export default function CustomerHistoryPanel({ customerHistory, riskProfile }) {
  try {
    // Return null if there is no history or if it's empty
    if (!customerHistory || !Array.isArray(customerHistory) || customerHistory.length === 0) {
      return null;
    }

    const totalTickets = customerHistory.length;
    const riskLevel = riskProfile?.riskLevel || 'low';
    const recommendation = riskProfile?.recommendation || '';

    // Style configuration mappings
    const riskStyles = {
      high: 'bg-red-900/40 text-red-400 border border-red-500/30',
      medium: 'bg-orange-900/40 text-orange-400 border border-orange-500/30',
      low: 'bg-green-900/40 text-green-400 border border-green-500/30'
    };

    const getDotColor = (res) => {
      if (res === 'escalated') return 'bg-red-400';
      if (res === 'pending_review') return 'bg-yellow-400';
      if (res === 'resolved' || res === 'auto_resolved') return 'bg-green-400';
      return 'bg-slate-400';
    };

    const getChipStyle = (res) => {
      if (res === 'escalated') return 'bg-red-900/30 text-red-400';
      if (res === 'pending_review') return 'bg-yellow-900/30 text-yellow-400';
      if (res === 'resolved' || res === 'auto_resolved') return 'bg-green-900/30 text-green-400';
      return 'bg-slate-900/30 text-slate-400';
    };

    const capitalize = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    return (
      <div className="rounded-lg border-2 border-yellow-500/40 bg-yellow-500/5 p-4 mb-4">
        {/* Header Summary Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-bold text-yellow-400">
              Repeat Customer — {totalTickets} Previous Ticket{totalTickets > 1 ? 's' : ''}
            </span>
          </div>
          
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${riskStyles[riskLevel] || riskStyles.low}`}>
            {capitalize(riskLevel)} Risk
          </span>
        </div>

        {/* Action Recommendation */}
        {recommendation && (
          <p className="text-xs text-[#94a3b8] italic mb-3">
            {recommendation}
          </p>
        )}

        {/* Previous Interaction Entries */}
        <div className="space-y-2">
          {customerHistory.map((item, index) => (
            <div key={item.ticketId || index} className="flex items-start gap-3 p-2 rounded-lg bg-[#263548]">
              {/* Status Indicator Dot */}
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(item.resolution)}`} />
              
              {/* Ticket Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-[#e2e8f0] truncate">
                    {item.subject}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 mt-0.5">
                  {item.processedAt && (
                    <span className="text-xs text-[#64748b]">
                      {timeAgo(item.processedAt)}
                    </span>
                  )}
                  {item.category && (
                    <span className="text-[10px] bg-[#1e293b] text-[#94a3b8] px-1.5 py-0.2 rounded-full font-medium">
                      {item.category}
                    </span>
                  )}
                  {item.resolution && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${getChipStyle(item.resolution)}`}>
                      {item.resolution.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error) {
    console.error('[CustomerHistoryPanel] Error rendering history panel:', error);
    return null;
  }
}
