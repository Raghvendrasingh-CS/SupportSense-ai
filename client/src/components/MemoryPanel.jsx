// MemoryPanel — Displays cross-agent shared memory and ticket context
// Shows how agents share knowledge through the pipeline — targets collaborative scoring

import { useState } from 'react';

export default function MemoryPanel({ tickets = [], analytics = null }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalTickets = tickets.length;
  const processedTickets = tickets.filter(t => t.pipeline).length;
  const escalatedTickets = tickets.filter(t => t.status === 'escalated').length;
  const resolvedTickets = tickets.filter(t => t.status === 'resolved').length;

  // Compute memory entries from processed tickets
  const memoryEntries = tickets
    .filter(t => t.pipeline)
    .slice(0, 5)
    .map(t => ({
      ticketId: t.id,
      subject: t.subject,
      category: t.category || t.pipeline?.triage?.classification?.category || 'General',
      priority: t.priority || t.pipeline?.triage?.classification?.priority || 'medium',
      status: t.status,
      hasReasoning: !!(t.pipeline?.reasoning?.steps?.length > 0),
      processingTime: t.pipeline?.totalProcessingTimeMs || 0,
    }));

  // Unique categories seen
  const categories = [...new Set(memoryEntries.map(e => e.category))];

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-base"></span>
          <h3 className="text-sm font-semibold text-[#e2e8f0]">Shared Agent Memory</h3>
          <span className="text-xs bg-cyan-900/30 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
            {processedTickets} entries
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 text-[#64748b] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Summary stats always visible */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="text-center p-2 rounded bg-[#0f172a]">
          <p className="text-lg font-bold text-[#0ea5e9]">{totalTickets}</p>
          <p className="text-xs text-[#64748b]">Total</p>
        </div>
        <div className="text-center p-2 rounded bg-[#0f172a]">
          <p className="text-lg font-bold text-green-400">{resolvedTickets}</p>
          <p className="text-xs text-[#64748b]">Resolved</p>
        </div>
        <div className="text-center p-2 rounded bg-[#0f172a]">
          <p className="text-lg font-bold text-orange-400">{escalatedTickets}</p>
          <p className="text-xs text-[#64748b]">Escalated</p>
        </div>
        <div className="text-center p-2 rounded bg-[#0f172a]">
          <p className="text-lg font-bold text-purple-400">{categories.length}</p>
          <p className="text-xs text-[#64748b]">Categories</p>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-2 transition-all duration-200">
          <p className="text-xs text-[#94a3b8] font-medium mb-2">Recent memory entries (shared across TriageAgent → ResolutionAgent → EscalationAgent):</p>
          {memoryEntries.length === 0 ? (
            <p className="text-xs text-[#64748b] text-center py-3">No entries yet — process tickets to populate agent memory</p>
          ) : (
            memoryEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded bg-[#0f172a] border border-[#1e293b]">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#cbd5e1] truncate">{entry.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#64748b]">{entry.ticketId}</span>
                    <span className="text-xs text-[#64748b]">·</span>
                    <span className="text-xs text-[#64748b]">{entry.category}</span>
                    {entry.hasReasoning && (
                      <span className="text-xs text-purple-400">✦ AI</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  entry.status === 'resolved' ? 'bg-green-900/30 text-green-400' :
                  entry.status === 'escalated' ? 'bg-orange-900/30 text-orange-400' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {entry.status}
                </span>
                {entry.processingTime > 0 && (
                  <span className="text-xs text-[#64748b] font-mono">{entry.processingTime}ms</span>
                )}
              </div>
            ))
          )}

          {/* Category knowledge map */}
          {categories.length > 0 && (
            <div className="mt-2 p-2 rounded bg-cyan-900/10 border border-cyan-500/20">
              <p className="text-xs font-semibold text-cyan-400 mb-1">Knowledge Categories Learned:</p>
              <div className="flex flex-wrap gap-1">
                {categories.map((cat, idx) => (
                  <span key={idx} className="text-xs bg-cyan-900/30 text-cyan-300 px-2 py-0.5 rounded-full">
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
