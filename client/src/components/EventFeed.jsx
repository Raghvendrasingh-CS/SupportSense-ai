// Real-time event feed showing Socket.io pipeline state change events.
const EVENT_COLORS = {
  'pipeline:started': 'border-l-blue-500',
  'pipeline:completed': 'border-l-green-500',
  'pipeline:error': 'border-l-red-500',
  'triage:started': 'border-l-indigo-400',
  'triage:completed': 'border-l-indigo-600',
  'resolution:started': 'border-l-purple-400',
  'resolution:completed': 'border-l-purple-600',
  'escalation:started': 'border-l-orange-400',
  'escalation:completed': 'border-l-orange-600',
  'batch:started': 'border-l-cyan-400',
  'batch:completed': 'border-l-cyan-600',
  'debate:initiated': 'border-l-yellow-400',
  'debate:started': 'border-l-yellow-500',
  'debate:round': 'border-l-yellow-600',
};

export default function EventFeed({ events, onClear }) {
  try {
    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e2e8f0]">Live Event Feed</h3>
          {events.length > 0 && (
            <button onClick={onClear} className="text-xs text-[#94a3b8] hover:text-[#e2e8f0]">
              Clear
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-[#64748b] text-center py-8">
              Waiting for pipeline events... Run the demo to see live updates.
            </p>
          ) : (
            events.map((entry, i) => (
              <div
                key={`${entry.event}-${i}`}
                className={`border-l-4 ${EVENT_COLORS[entry.event] || 'border-l-gray-600'} pl-3 py-2 animate-slide-in bg-[#0f172a] rounded-r-lg`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-[#f1f5f9]">{entry.event}</span>
                  <span className="text-xs text-[#64748b]">
                    {new Date(entry.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
                {entry.data?.ticketId && (
                  <p className="text-xs text-[#94a3b8] mt-0.5">Ticket: {entry.data.ticketId}</p>
                )}
                {entry.data?.status && (
                  <p className="text-xs text-[#94a3b8]">Status: {entry.data.status}</p>
                )}
                {entry.data?.totalProcessingTimeMs && (
                  <p className="text-xs text-[#0ea5e9]">{entry.data.totalProcessingTimeMs}ms total</p>
                )}
                {entry.data?.message && (
  <p className="text-xs text-[#fbbf24] mt-0.5">{entry.data.message}</p>
)}
{entry.data?.speaker && (
  <p className="text-xs text-[#94a3b8]">Speaker: {entry.data.speaker}</p>
)}
              </div>
            ))
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[EventFeed] ${new Date().toISOString()} ERROR:`, error);
    return null;
  }
}
