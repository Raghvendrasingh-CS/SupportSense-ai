export default function AgentPanel({ workload }) {
  try {
    console.log("Workload Data:", workload);

    const {
      totalAgents = 0,
      availableAgents = 0,
      avgWorkload = 0,
      agentPool = [],
    } = workload?.insights || {};

    if (!agentPool.length) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">
            Support Agent Pool (Work IQ)
          </h3>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#0f172a] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-[#f1f5f9]">5</p>
              <p className="text-xs text-[#94a3b8] mt-1">Total Agents</p>
            </div>

            <div className="bg-[#0f172a] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-400">3</p>
              <p className="text-xs text-[#94a3b8] mt-1">Available</p>
            </div>

            <div className="bg-[#0f172a] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-[#0ea5e9]">4.6</p>
              <p className="text-xs text-[#94a3b8] mt-1">Avg Workload</p>
            </div>
          </div>

          <div className="text-center text-slate-400 text-sm">
            No live agent data available
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-4">
          Support Agent Pool (Work IQ)
        </h3>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 bg-[#0f172a] rounded-lg border border-[#334155]/60">
            <p className="text-lg font-bold text-[#f1f5f9]">{totalAgents}</p>
            <p className="text-xs text-[#94a3b8]">Total Agents</p>
          </div>

          <div className="text-center p-3 bg-green-950/20 rounded-lg border border-green-800/20">
            <p className="text-lg font-bold text-green-400">
              {availableAgents}
            </p>
            <p className="text-xs text-[#94a3b8]">Available</p>
          </div>

          <div className="text-center p-3 bg-blue-950/20 rounded-lg border border-blue-800/20">
            <p className="text-lg font-bold text-[#0ea5e9]">
              {avgWorkload}
            </p>
            <p className="text-xs text-[#94a3b8]">Avg Workload</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {agentPool.map((agent) => {
            const workloadValue = Number(agent?.workload || 0);

            let workloadColor = "bg-emerald-500";
            if (workloadValue >= 8) {
              workloadColor = "bg-rose-500";
            } else if (workloadValue >= 5) {
              workloadColor = "bg-amber-500";
            }

            const tierColors = {
              L1: "bg-slate-900/40 text-slate-400 border border-slate-700/30",
              L2: "bg-blue-900/30 text-blue-400 border border-blue-500/20",
              L3: "bg-purple-900/30 text-purple-400 border border-purple-500/20",
            };

            const tier =
              agent?.tier?.toUpperCase?.() || "L1";

            const isAvailable =
              agent?.availability === "available";

            return (
              <div
                key={agent?.id || agent?.name}
                className="p-4 bg-[#0f172a] border border-[#334155] rounded-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isAvailable
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-slate-500"
                        }`}
                      />

                      <p className="text-sm font-semibold text-[#f1f5f9] truncate">
                        {agent?.name || "Unknown Agent"}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        tierColors[tier] || tierColors.L1
                      }`}
                    >
                      {tier}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(agent?.skills || []).map((skill) => (
                      <span
                        key={skill}
                        className="text-[10px] bg-[#1e293b] text-[#cbd5e1] px-2 py-0.5 rounded border border-[#334155]/60"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#94a3b8]">Workload</span>

                    <span
                      className={`font-semibold ${
                        workloadValue >= 8
                          ? "text-rose-400"
                          : workloadValue >= 5
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {workloadValue}/10
                    </span>
                  </div>

                  <div className="w-full bg-[#263548] h-2 rounded-full overflow-hidden">
                    <div
                      className={`${workloadColor} h-full rounded-full`}
                      style={{
                        width: `${Math.min(
                          workloadValue * 10,
                          100
                        )}%`,
                      }}
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
    console.error("AgentPanel Error:", error);

    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400">
        <p className="font-semibold">Failed to load agent data</p>
        <p className="text-xs mt-2">
          {error?.message || "Unknown error"}
        </p>
      </div>
    );
  }
}
