// Analytics dashboard with Recharts visualizations for ticket metrics.
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#0078d4', '#106ebe', '#005a9e', '#004578', '#8764b8'];

export default function AnalyticsPanel({ analytics, serviceHealth }) {
  try {
    if (!analytics) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-500 text-sm">Loading analytics...</p>
        </div>
      );
    }

    const { ticketVolumeTrend, categoryBreakdown, slaCompliance, avgFirstResponseMinutes, avgResolutionHours } = analytics;

    const pieData = (categoryBreakdown || []).map((c) => ({
      name: c.category,
      value: c.count,
    }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label="SLA Compliance" value={`${slaCompliance}%`} color="text-green-600" />
          <MetricCard label="Avg First Response" value={`${avgFirstResponseMinutes} min`} color="text-ms-blue" />
          <MetricCard label="Avg Resolution" value={`${avgResolutionHours} hrs`} color="text-purple-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Ticket Volume Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ticketVolumeTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#0078d4" fill="#deecf9" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Category Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBreakdown || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0078d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribution by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {serviceHealth?.services && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">M365 Service Health</h3>
              <div className="space-y-3">
                {serviceHealth.services.map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{svc.name}</span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      svc.status === 'healthy' ? 'bg-green-100 text-green-700' :
                      svc.status === 'degraded' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {svc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[AnalyticsPanel] ${new Date().toISOString()} ERROR:`, error);
    return <div className="text-red-500 text-sm">Failed to load analytics</div>;
  }
}

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
