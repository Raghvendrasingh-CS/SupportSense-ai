// Ticket list component displaying all processed support tickets.
import { useState } from 'react';
import StatusBadge from './StatusBadge';

export default function TicketList({ tickets, selectedId, onSelect, processingTicketId }) {
  const [filter, setFilter] = useState('all');

  try {
    const safeTickets = tickets || [];
    
    const filterOptions = [
      { id: 'all', label: 'All', count: safeTickets.length },
      { id: 'escalated', label: 'Escalated', count: safeTickets.filter(t => t.status === 'escalated').length },
      { id: 'resolved', label: 'Resolved', count: safeTickets.filter(t => t.status === 'resolved').length },
      { id: 'pending_review', label: 'Pending', count: safeTickets.filter(t => t.status === 'pending_review').length }
    ];

    const filteredTickets = filter === 'all' 
      ? safeTickets 
      : safeTickets.filter(t => t.status === filter);

    const filterLabels = {
      all: 'all',
      escalated: 'escalated',
      resolved: 'resolved',
      pending_review: 'pending'
    };

    if (safeTickets.length === 0) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Tickets</h3>
          {processingTicketId && (
            <div className="w-full text-left p-3 rounded-lg border border-dashed border-[#0ea5e9]/40 bg-[#0ea5e9]/5 animate-pulse mb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0ea5e9]">Analyzing ticket...</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">Work IQ + Fabric IQ pipeline active</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#0ea5e9]/20 text-[#0ea5e9]">PROCESSING</span>
              </div>
            </div>
          )}
          <p className="text-sm text-[#64748b] text-center py-8">
            No tickets yet. Click "Run Demo Pipeline" or submit a new ticket.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">
          Tickets ({safeTickets.length})
        </h3>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-3 p-1 bg-[#0f172a] rounded-lg">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={
                filter === opt.id
                  ? 'px-3 py-1.5 text-xs font-medium rounded-md bg-[#0ea5e9] text-white flex-1 text-center transition-colors'
                  : 'px-3 py-1.5 text-xs font-medium rounded-md text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#263548] flex-1 text-center transition-colors'
              }
            >
              {opt.label} ({opt.count})
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {processingTicketId && (
            <div className="w-full text-left p-3 rounded-lg border border-dashed border-[#0ea5e9]/40 bg-[#0ea5e9]/5 animate-pulse">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0ea5e9]">Analyzing ticket...</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">Work IQ + Fabric IQ pipeline active</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#0ea5e9]/20 text-[#0ea5e9]">PROCESSING</span>
              </div>
            </div>
          )}

          {filteredTickets.length === 0 ? (
            <p className="text-sm text-[#64748b] text-center py-8">
              No {filterLabels[filter] || filter} tickets found.
            </p>
          ) : (
            (() => {
              const sorted = [...filteredTickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              return sorted.map((ticket) => {
                const priority = ticket.priority || ticket.pipeline?.triage?.classification?.priority;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => onSelect(ticket.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedId === ticket.id
                        ? 'border-[#0ea5e9] bg-blue-900/30'
                        : 'border-[#334155] hover:border-[#475569] hover:bg-[#263548]'
                    } border-l-4 ${
                      priority === 'critical' ? 'border-l-red-500' :
                      priority === 'high' ? 'border-l-orange-400' :
                      priority === 'medium' ? 'border-l-yellow-400' :
                      priority === 'low' ? 'border-l-green-400' :
                      'border-l-[#334155]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[#f1f5f9] truncate">{ticket.subject}</p>
                          {ticket.pipeline?.reasoning?.steps?.length > 0 && (
                            <span className="text-xs text-purple-400 bg-purple-900/30 border border-purple-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">AI Reasoning</span>
                          )}
                        </div>
                        <p className="text-xs text-[#94a3b8] mt-0.5">{ticket.id}</p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {ticket.priority && <StatusBadge status={ticket.priority} type="priority" />}
                      {ticket.category && (
                        <span className="text-xs text-[#64748b]">{ticket.category}</span>
                      )}
                      {ticket.pipeline?.triage?.classification?.categoryConfidence && (
                        <span className="text-xs font-mono text-[#64748b]">
                          {Math.round(ticket.pipeline.triage.classification.categoryConfidence * 100)}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              });
            })()
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[TicketList] ${new Date().toISOString()} ERROR:`, error);
    return null;
  }
}
