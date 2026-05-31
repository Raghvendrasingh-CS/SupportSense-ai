// Agent workload panel showing support agent availability and skill matching.
export default function AgentPanel({ workload }) {
  try {
    if (!workload?.insights) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <p className="text-[#94a3b8] text-sm">Loading agent data...</p>
        </div>
      );
    }

    const { totalAgents, availableAgents, avgWorkload, agentPool } = workload.insights;

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">Support Agent Pool (Work IQ)</h3>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-3 bg-[#0f172a] rounded-lg">
            <p className="text-lg font-bold text-[#f1f5f9]">{totalAgents}</p>
            <p className="text-xs text-[#94a3b8]">Total Agents</p>
          </div>
          <div className="text-center p-3 bg-green-950/20 rounded-lg">
            <p className="text-lg font-bold text-green-400">{availableAgents}</p>
            <p className="text-xs text-[#94a3b8]">Available</p>
          </div>
          <div className="text-center p-3 bg-blue-950/20 rounded-lg">
            <p className="text-lg font-bold text-[#0ea5e9]">{avgWorkload}</p>
            <p className="text-xs text-[#94a3b8]">Avg Workload</p>
          </div>
        </div>

        <div className="space-y-2">
          {(agentPool || []).map((agent) => (
            <div key={agent.id} className="flex items-center justify-between p-3 bg-[#0f172a] rounded-lg">
              <div>
                <p className="text-sm font-medium text-[#f1f5f9]">{agent.name}</p>
                <p className="text-xs text-[#94a3b8]">{agent.skills.join(', ')} · {agent.tier}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-[#263548] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${agent.workload > 6 ? 'bg-red-500' : agent.workload > 3 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${agent.workload * 10}%` }}
                  />
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  agent.availability === 'available' ? 'bg-green-900/30 text-green-400' : 'bg-orange-900/30 text-orange-400'
                }`}>
                  {agent.availability}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[AgentPanel] ${new Date().toISOString()} ERROR:`, error);
    return <div className="text-red-500 text-sm">Failed to load agent data</div>;
  }
}
