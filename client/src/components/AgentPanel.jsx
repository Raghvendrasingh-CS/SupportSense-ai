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

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 bg-[#0f172a] rounded-lg border border-[#334155]/60">
            <p className="text-lg font-bold text-[#f1f5f9]">{totalAgents}</p>
            <p className="text-xs text-[#94a3b8]">Total Agents</p>
          </div>
          <div className="text-center p-3 bg-green-950/20 rounded-lg border border-green-800/20">
            <p className="text-lg font-bold text-green-400">{availableAgents}</p>
            <p className="text-xs text-[#94a3b8]">Available</p>
          </div>
          <div className="text-center p-3 bg-blue-950/20 rounded-lg border border-blue-800/20">
            <p className="text-lg font-bold text-[#0ea5e9]">{avgWorkload}</p>
            <p className="text-xs text-[#94a3b8]">Avg Workload</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(agentPool || []).map((agent) => {
            const workloadValue = agent.workload || 0;
            let workloadColor = 'bg-emerald-500';
            if (workloadValue >= 8) {
              workloadColor = 'bg-rose-500';
            } else if (workloadValue >= 5) {
              workloadColor = 'bg-amber-500';
            }

            const tierColors = {
              L1: 'bg-slate-900/40 text-slate-400 border border-slate-700/30',
              L2: 'bg-blue-900/30 text-blue-400 border border-blue-500/20',
              L3: 'bg-purple-900/30 text-purple-400 border border-purple-500/20',
            };

            const isAvailable = agent.availability === 'available';

            return (
              <div key={agent.id} className="p-4 bg-[#0f172a] border border-[#334155] rounded-xl flex flex-col justify-between hover:border-slate-500/30 transition-all group">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                      <p className="text-sm font-semibold text-[#f1f5f9] truncate">{agent.name}</p>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${tierColors[agent.tier] || tierColors.L1}`}>
                      {agent.tier}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(agent.skills || []).map((skill) => (
                      <span key={skill} className="text-[10px] bg-[#1e293b] text-[#cbd5e1] px-2 py-0.5 rounded border border-[#334155]/60">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 mt-auto">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#94a3b8]">Workload</span>
                    <span className={`font-semibold ${workloadValue >= 8 ? 'text-rose-400' : workloadValue >= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {workloadValue}/10
                    </span>
                  </div>
                  <div className="w-full bg-[#263548] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${workloadColor}`}
                      style={{ width: `${workloadValue * 10}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[AgentPanel] ${new Date().toISOString()} ERROR:`, error);
    return <div className="text-red-500 text-sm">Failed to load agent data</div>;
  }
}
