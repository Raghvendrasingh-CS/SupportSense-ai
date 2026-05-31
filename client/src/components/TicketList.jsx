// Ticket list component displaying all processed support tickets.
import StatusBadge from './StatusBadge';

export default function TicketList({ tickets, selectedId, onSelect }) {
  try {
    if (!tickets || tickets.length === 0) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets</h3>
          <p className="text-sm text-gray-400 text-center py-8">
            No tickets yet. Click "Run Demo Pipeline" or submit a new ticket.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Tickets ({tickets.length})
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onSelect(ticket.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedId === ticket.id
                  ? 'border-ms-blue bg-ms-light'
                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ticket.id}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                {ticket.priority && <StatusBadge status={ticket.priority} type="priority" />}
                {ticket.category && (
                  <span className="text-xs text-gray-400">{ticket.category}</span>
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
