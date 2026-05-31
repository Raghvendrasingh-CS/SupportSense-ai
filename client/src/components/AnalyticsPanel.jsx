// Analytics dashboard with Recharts visualizations for ticket metrics.
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444'];

export default function AnalyticsPanel({ analytics, serviceHealth }) {
  try {
    if (!analytics) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <p className="text-[#94a3b8] text-sm">Loading analytics...</p>
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
          <MetricCard label="SLA Compliance" value={`${slaCompliance}%`} color="text-green-400" />
          <MetricCard label="Avg First Response" value={`${avgFirstResponseMinutes} min`} color="text-[#0ea5e9]" />
          <MetricCard label="Avg Resolution" value={`${avgResolutionHours} hrs`} color="text-purple-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
            <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Ticket Volume Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ticketVolumeTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="rgba(14,165,233,0.1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
            <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Category Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBreakdown || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
            <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Distribution by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {serviceHealth?.services && (
            <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
              <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">M365 Service Health</h3>
              <div className="space-y-3">
                {serviceHealth.services.map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between py-2 border-b border-[#334155] last:border-0">
                    <span className="text-sm text-[#e2e8f0]">{svc.name}</span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      svc.status === 'healthy' ? 'bg-green-900/30 text-green-400' :
                      svc.status === 'degraded' ? 'bg-yellow-900/30 text-yellow-400' :
                      'bg-red-900/30 text-red-400'
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
    <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-5">
      <p className="text-xs text-[#94a3b8] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
