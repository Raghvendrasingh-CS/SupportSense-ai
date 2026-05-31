// Agent workload panel showing support agent availability and skill matching.
export default function AgentPanel({ workload }) {
  try {
    if (!workload?.insights) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-500 text-sm">Loading agent data...</p>
        </div>
      );
    }

    const { totalAgents, availableAgents, avgWorkload, agentPool } = workload.insights;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Support Agent Pool (Work IQ)</h3>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-lg font-bold text-gray-900">{totalAgents}</p>
            <p className="text-xs text-gray-500">Total Agents</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-lg font-bold text-green-700">{availableAgents}</p>
            <p className="text-xs text-gray-500">Available</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-lg font-bold text-ms-blue">{avgWorkload}</p>
            <p className="text-xs text-gray-500">Avg Workload</p>
          </div>
        </div>

        <div className="space-y-2">
          {(agentPool || []).map((agent) => (
            <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                <p className="text-xs text-gray-500">{agent.skills.join(', ')} · {agent.tier}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${agent.workload > 6 ? 'bg-red-500' : agent.workload > 3 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${agent.workload * 10}%` }}
                  />
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  agent.availability === 'available' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
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
