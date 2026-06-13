import { useState } from 'react';
import StatusBadge from './StatusBadge';
import CustomerHistoryPanel from './CustomerHistoryPanel';
import ReasoningChain from './ReasoningChain';
import DebateTranscript from './DebateTranscript';
import AdaptiveCard from './AdaptiveCard';
import { api } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatChartDate(dateString) {
  try {
    if (!dateString) return '';
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}`;
  } catch (e) {
    return dateString || '';
  }
}

const sentimentMap = {
  positive: 1,
  neutral: 2,
  frustrated: 3,
  angry: 4
};
const getSentimentValue = (sentiment) => {
  if (!sentiment) return 2;
  const key = sentiment.toLowerCase();
  return sentimentMap[key] || 2;
};

export default function TicketDetail({ ticket, customerHistory, riskProfile, onRefresh }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAccept = async () => {
    try {
      setIsUpdating(true);
      await api.updateTicket(ticket.id, { status: 'in_progress' });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to accept ticket:', error);
      alert('Failed to accept ticket: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReassign = async () => {
    try {
      setIsUpdating(true);
      await api.updateTicket(ticket.id, { status: 'pending_review' });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to reassign ticket:', error);
      alert('Failed to reassign ticket: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  try {
    if (!ticket) {
      return (
        <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6">
          <p className="text-sm text-[#64748b] text-center py-12">
            Select a ticket to view pipeline details
          </p>
        </div>
      );
    }

    const pipeline = ticket.pipeline;
    const reasoning = ticket?.pipeline?.reasoning || ticket?.reasoning || null;

    const chartData = customerHistory && customerHistory.length >= 2
      ? [...customerHistory]
          .reverse()
          .map(item => ({
            date: formatChartDate(item.processedAt),
            sentimentVal: getSentimentValue(item.sentiment),
            sentimentLabel: item.sentiment ? item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1) : 'Neutral'
          }))
      : [];

    return (
      <div className="bg-[#1e293b] rounded-xl shadow-sm border border-[#334155] p-6 space-y-6">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#f1f5f9]">{ticket.subject}</h2>
              <p className="text-sm text-[#94a3b8] mt-1">{ticket.id} · {ticket.description}</p>
            </div>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex gap-2 mt-3">
            {ticket.priority && <StatusBadge status={ticket.priority} type="priority" />}
            {ticket.category && (
              <span className="text-xs bg-[#263548] text-[#cbd5e1] px-2 py-0.5 rounded-full">{ticket.category}</span>
            )}
          </div>
        </div>

        <CustomerHistoryPanel customerHistory={customerHistory} riskProfile={riskProfile} />

        {customerHistory && customerHistory.length >= 2 && (
          <div className="bg-[#0f172a]/40 border border-[#334155] rounded-xl p-4 mt-2">
            <h4 className="text-xs font-bold text-[#e2e8f0] mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Customer Sentiment Trend
            </h4>
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[1, 4]}
                    ticks={[1, 2, 3, 4]}
                    tickFormatter={(val) => {
                      if (val === 1) return 'Positive';
                      if (val === 2) return 'Neutral';
                      if (val === 3) return 'Frustrated';
                      if (val === 4) return 'Angry';
                      return '';
                    }}
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }}
                    formatter={(value, name, props) => [props.payload.sentimentLabel, 'Sentiment']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="sentimentVal"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#ef4444', stroke: '#ef4444', strokeWidth: 1 }}
                    activeDot={{ r: 6 }}
                    name="Sentiment Trend"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

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
            >
              {pipeline.triage?.serviceHealth && pipeline.triage.serviceHealth.status !== 'healthy' && (
                <div className="mt-3 p-3 rounded bg-red-950/40 border border-red-800/50 flex items-start gap-2.5">
                  <span className="text-red-400 mt-0.5 text-xs">⚠️</span>
                  <div>
                    <p className="text-xs font-semibold text-red-400">Microsoft Graph Service Incident</p>
                    <p className="text-xs text-red-300/80 mt-0.5 animate-pulse">
                      Microsoft Graph reports {pipeline.triage.serviceHealth.name} status is {pipeline.triage.serviceHealth.status} — this issue is likely systemic, not user-specific.
                    </p>
                  </div>
                </div>
              )}
            </PipelineStep>


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
                { label: 'Match Score', value: pipeline.escalation?.assignedAgent?.matchScore ? `${Math.round(pipeline.escalation.assignedAgent.matchScore * 100)}%` : null },
              ]}
            >
              {pipeline.escalation?.reasons?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[#cbd5e1] mb-2">Escalation Reasons:</p>
                  {pipeline.escalation.reasons.map((r, i) => (
                    <p key={i} className="text-xs text-[#94a3b8]">• {r.detail || r.code}</p>
                  ))}
                </div>
              )}
              {pipeline.escalation?.adaptiveCard && (
                <AdaptiveCard card={pipeline.escalation.adaptiveCard} />
              )}
              {ticket.status === 'escalated' && (
                <div className="flex gap-2.5 mt-4 pt-3 border-t border-orange-900/30">
                  <button
                    onClick={handleAccept}
                    disabled={isUpdating}
                    className="flex-1 py-1.5 px-3 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {isUpdating ? 'Updating...' : 'Accept & Assign'}
                  </button>
                  <button
                    onClick={handleReassign}
                    disabled={isUpdating}
                    className="flex-1 py-1.5 px-3 text-xs font-bold rounded-lg bg-slate-600 hover:bg-slate-500 text-[#cbd5e1] hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    Reassign
                  </button>
                </div>
              )}
            </PipelineStep>

            <ReasoningChain reasoning={reasoning} startExpanded={true} />

            {pipeline?.debate && (
  <DebateTranscript debate={pipeline.debate} />
)}

             <div className="flex items-center justify-between pt-4 border-t border-[#334155]">
              <span className="text-xs text-[#94a3b8]">
                Pipeline completed: {pipeline.completedAt ? new Date(pipeline.completedAt).toLocaleString() : 'N/A'}
              </span>
              <span className="text-sm font-semibold text-[#0ea5e9]">
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
    indigo: 'bg-indigo-950/30 border-indigo-800/50 text-indigo-400',
    purple: 'bg-purple-950/30 border-purple-800/50 text-purple-400',
    orange: 'bg-orange-950/30 border-orange-800/50 text-orange-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]?.split(' ').slice(0, 2).join(' ') || 'bg-[#0f172a] border-[#334155]'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className={`text-sm font-bold ${colorMap[color]?.split(' ')[2] || 'text-[#cbd5e1]'}`}>{agent}</h4>
        {data?.processingTimeMs && (
          <span className="text-xs text-[#94a3b8]">{data.processingTimeMs}ms</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.filter((f) => f.value).map((f) => (
          <div key={f.label}>
            <p className="text-xs text-[#94a3b8]">{f.label}</p>
            <p className="text-sm font-medium text-[#cbd5e1]">{f.value}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
