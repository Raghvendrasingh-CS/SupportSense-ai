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
};

export default function EventFeed({ events, onClear }) {
  try {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Live Event Feed</h3>
          {events.length > 0 && (
            <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700">
              Clear
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Waiting for pipeline events... Run the demo to see live updates.
            </p>
          ) : (
            events.map((entry, i) => (
              <div
                key={`${entry.event}-${i}`}
                className={`border-l-4 ${EVENT_COLORS[entry.event] || 'border-l-gray-300'} pl-3 py-2 animate-slide-in bg-gray-50 rounded-r-lg`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-gray-800">{entry.event}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
                {entry.data?.ticketId && (
                  <p className="text-xs text-gray-500 mt-0.5">Ticket: {entry.data.ticketId}</p>
                )}
                {entry.data?.status && (
                  <p className="text-xs text-gray-500">Status: {entry.data.status}</p>
                )}
                {entry.data?.totalProcessingTimeMs && (
                  <p className="text-xs text-ms-blue">{entry.data.totalProcessingTimeMs}ms total</p>
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
