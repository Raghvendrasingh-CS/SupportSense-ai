// Status badge component for ticket and pipeline states with color coding.
const STATUS_STYLES = {
  received: 'bg-gray-100 text-gray-700',
  triaging: 'bg-blue-100 text-blue-700',
  resolving: 'bg-indigo-100 text-indigo-700',
  escalating: 'bg-orange-100 text-orange-700',
  escalated: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-200 text-red-800',
  open: 'bg-blue-50 text-blue-600',
};

const PRIORITY_STYLES = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-green-500 text-white',
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
