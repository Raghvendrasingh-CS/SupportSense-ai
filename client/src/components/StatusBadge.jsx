// Status badge component for ticket and pipeline states with color coding.
const STATUS_STYLES = {
  received: 'bg-[#263548] text-[#e2e8f0]',
  triaging: 'bg-blue-900/30 text-blue-400 border border-blue-500/20',
  resolving: 'bg-indigo-900/30 text-indigo-400 border border-indigo-500/20',
  escalating: 'bg-orange-900/30 text-orange-400 border border-orange-500/20',
  escalated: 'bg-red-900/30 text-red-400 border border-red-500/20',
  resolved: 'bg-green-900/30 text-green-400 border border-green-500/20',
  pending_review: 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/20',
  in_progress: 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/20',
  error: 'bg-red-950/40 text-red-400 border border-red-900/20',
  open: 'bg-blue-950/30 text-blue-400 border border-blue-500/20',
};

const PRIORITY_STYLES = {
  critical: 'bg-red-900/50 text-red-300 border border-red-800/30',
  high: 'bg-orange-900/40 text-orange-300 border border-orange-800/30',
  medium: 'bg-yellow-900/30 text-yellow-300 border border-yellow-800/30',
  low: 'bg-green-900/30 text-green-300 border border-green-800/30',
};

export default function StatusBadge({ status, type = 'status' }) {
  try {
    const styles = type === 'priority' ? PRIORITY_STYLES : STATUS_STYLES;
    const className = styles[status] || 'bg-gray-100 text-gray-600';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
        {status?.replace(/_/g, ' ')}
      </span>
    );
  } catch (error) {
    console.error(`[StatusBadge] ${new Date().toISOString()} ERROR:`, error);
    return <span className="text-xs text-gray-500">{status}</span>;
  }
}
