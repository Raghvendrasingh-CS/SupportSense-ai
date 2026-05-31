// Ticket detail view showing full pipeline results from all three agents.
import StatusBadge from './StatusBadge';

export default function TicketDetail({ ticket }) {
  try {
    if (!ticket) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-400 text-center py-12">
            Select a ticket to view pipeline details
          </p>
        </div>
      );
    }

    const pipeline = ticket.pipeline;

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{ticket.subject}</h2>
              <p className="text-sm text-gray-500 mt-1">{ticket.id} · {ticket.description}</p>
            </div>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex gap-2 mt-3">
            {ticket.priority && <StatusBadge status={ticket.priority} type="priority" />}
            {ticket.category && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{ticket.category}</span>
            )}
          </div>
        </div>

        {!pipeline ? (
          <p className="text-sm text-gray-400">Pipeline not yet processed for this ticket.</p>
        ) : (
          <>
            <PipelineStep
              agent="TriageAgent"
              color="indigo"
              data={pipeline.triage}
              fields={[
                { label: 'Category', value: pipeline.triage?.classification?.category },
                { label: 'Priority', value: pipeline.triage?.classification?.priority },
                { label: 'Confidence', value: pipeline.triage?.classification?.categoryConfidence ? `${Math.round(pipeline.triage.classification.categoryConfidence * 100)}%` : null },
                { label: 'Required Skills', value: pipeline.triage?.requiredSkills?.join(', ') },
              ]}
            />

            <PipelineStep
              agent="ResolutionAgent"
              color="purple"
              data={pipeline.resolution}
              fields={[
                { label: 'Status', value: pipeline.resolution?.status },
                { label: 'Confidence', value: pipeline.resolution?.resolution?.confidence ? `${Math.round(pipeline.resolution.resolution.confidence * 100)}%` : null },
                { label: 'Auto-Resolve', value: pipeline.resolution?.resolution?.canAutoResolve ? 'Eligible' : 'Not eligible' },
                { label: 'Predicted Time', value: pipeline.resolution?.timePrediction?.predictedHours ? `${pipeline.resolution.timePrediction.predictedHours}h` : null },
              ]}
            >
              {pipeline.resolution?.resolution?.steps && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Resolution Steps:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    {pipeline.resolution.resolution.steps.map((step, i) => (
                      <li key={i} className="text-xs text-gray-600">{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </PipelineStep>

            <PipelineStep
              agent="EscalationAgent"
              color="orange"
              data={pipeline.escalation}
              fields={[
                { label: 'Escalated', value: pipeline.escalation?.escalated ? 'Yes' : 'No' },
                { label: 'Tier', value: pipeline.escalation?.escalationTier },
                { label: 'Assigned Agent', value: pipeline.escalation?.assignedAgent?.name },
                { label: 'Match Score', value: pipeline.escalation?.assignedAgent?.matchScore },
              ]}
            >
              {pipeline.escalation?.reasons?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Escalation Reasons:</p>
                  {pipeline.escalation.reasons.map((r, i) => (
                    <p key={i} className="text-xs text-gray-500">• {r.detail || r.code}</p>
                  ))}
                </div>
              )}
            </PipelineStep>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Pipeline completed: {pipeline.completedAt ? new Date(pipeline.completedAt).toLocaleString() : 'N/A'}
              </span>
              <span className="text-sm font-semibold text-ms-blue">
                Total: {pipeline.totalProcessingTimeMs}ms
              </span>
            </div>
          </>
        )}
      </div>
    );
  } catch (error) {
    console.error(`[TicketDetail] ${new Date().toISOString()} ERROR:`, error);
    return <div className="text-red-500 text-sm">Failed to render ticket details</div>;
  }
}

function PipelineStep({ agent, color, data, fields, children }) {
  const colorMap = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]?.split(' ').slice(0, 2).join(' ') || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className={`text-sm font-bold ${colorMap[color]?.split(' ')[2] || 'text-gray-700'}`}>{agent}</h4>
        {data?.processingTimeMs && (
          <span className="text-xs text-gray-500">{data.processingTimeMs}ms</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.filter((f) => f.value).map((f) => (
          <div key={f.label}>
            <p className="text-xs text-gray-500">{f.label}</p>
            <p className="text-sm font-medium text-gray-800">{f.value}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
