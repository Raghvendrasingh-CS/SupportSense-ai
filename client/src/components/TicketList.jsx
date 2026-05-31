// Ticket list component displaying all processed support tickets.
import StatusBadge from './StatusBadge';

export default function TicketList({ tickets, selectedId, onSelect }) {
  try {
    if (!tickets || tickets.length === 0) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Tickets</h3>
          <p className="text-sm text-[#64748b] text-center py-8">
            No tickets yet. Click "Run Demo Pipeline" or submit a new ticket.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">
          Tickets ({tickets.length})
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onSelect(ticket.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedId === ticket.id
                  ? 'border-[#0ea5e9] bg-blue-900/30'
                  : 'border-[#334155] hover:border-[#475569] hover:bg-[#263548]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#f1f5f9] truncate">{ticket.subject}</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">{ticket.id}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                {ticket.priority && <StatusBadge status={ticket.priority} type="priority" />}
                {ticket.category && (
                  <span className="text-xs text-[#64748b]">{ticket.category}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[TicketList] ${new Date().toISOString()} ERROR:`, error);
    return null;
  }
}
