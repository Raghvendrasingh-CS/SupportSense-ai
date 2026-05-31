// Agent pipeline visualizer showing the three-agent flow with live status.
const AGENTS = [
  { name: 'TriageAgent', description: 'Classify, prioritize & route', color: 'indigo', events: ['triage:started', 'triage:completed'] },
  { name: 'ResolutionAgent', description: 'Generate solutions via KB', color: 'purple', events: ['resolution:started', 'resolution:completed'] },
  { name: 'EscalationAgent', description: 'Assign agents & track SLA', color: 'orange', events: ['escalation:started', 'escalation:completed'] },
];

export default function PipelineVisualizer({ latestEvent, processing }) {
  try {
    const getAgentStatus = (agent) => {
      if (!latestEvent) return 'idle';
      const event = latestEvent.event;

      if (agent.events[1] === event) return 'completed';
      if (agent.events[0] === event) return 'active';

      const agentIndex = AGENTS.findIndex((a) => a.name === agent.name);
      const completedIndex = AGENTS.findIndex((a) => a.events[1] === event);
      if (completedIndex > agentIndex) return 'completed';
      if (completedIndex === agentIndex - 1) return 'active';

      if (event === 'pipeline:completed') return 'completed';
      if (processing) return agentIndex === 0 ? 'active' : 'idle';

      return 'idle';
    };

    const statusStyles = {
      idle: 'bg-[#263548] border-[#334155] text-[#94a3b8]',
      active: 'bg-blue-900/30 border-[#0ea5e9] text-[#0ea5e9] ring-2 ring-[#0ea5e9]/20',
      completed: 'bg-green-900/20 border-green-700/50 text-green-400',
    };

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-5">Agent Pipeline</h3>

        <div className="flex items-center justify-between gap-2">
          {AGENTS.map((agent, i) => {
            const status = getAgentStatus(agent);
            return (
              <div key={agent.name} className="flex items-center flex-1">
                <div className={`flex-1 text-center p-4 rounded-xl border-2 transition-all duration-300 ${statusStyles[status]}`}>
                  <div className="flex items-center justify-center mb-2">
                    {status === 'active' && (
                      <span className="w-2 h-2 bg-[#0ea5e9] rounded-full animate-pulse-dot mr-2" />
                    )}
                    {status === 'completed' && (
                      <svg className="w-4 h-4 text-green-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className="text-sm font-bold">{agent.name}</span>
                  </div>
                  <p className="text-xs opacity-75">{agent.description}</p>
                </div>

                {i < AGENTS.length - 1 && (
                  <svg className="w-6 h-6 text-[#475569] mx-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-[#94a3b8]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-900/30 border border-[#0ea5e9]" /> Work IQ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-900/30 border border-purple-500/50" /> Fabric IQ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-900/30 border border-green-500/50" /> Microsoft Graph
          </span>
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[PipelineVisualizer] ${new Date().toISOString()} ERROR:`, error);
    return null;
  }
}
