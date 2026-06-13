// DebateTranscript — Shows live adversarial debate between ResolutionAgent and EscalationAgent
// This is the most novel feature — agents arguing with each other to reach consensus

import { useState } from 'react';

export default function DebateTranscript({ debate }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!debate || !debate.debateLogs || debate.debateLogs.length === 0) return null;

  const { debateLogs, consensusReached, humanInTheLoop, iterations } = debate;

  const statusColor = humanInTheLoop
    ? 'text-red-400 border-red-500/20 bg-red-500/5'
    : consensusReached
    ? 'text-green-400 border-green-500/20 bg-green-500/5'
    : 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5';

  const statusText = humanInTheLoop
    ? 'Human-in-the-Loop Required'
    : consensusReached
    ? 'Consensus Reached'
    : 'Max Iterations Reached';

  const speakerColors = {
    ResolutionAgent: {
      circle: 'bg-purple-900/50 text-purple-400 border border-purple-500/30',
      chip: 'bg-purple-900/30 text-purple-400',
      message: 'bg-purple-900/10 border-purple-500/20',
    },
    EscalationAgent: {
      circle: 'bg-green-900/50 text-green-400 border border-green-500/30',
      chip: 'bg-green-900/30 text-green-400',
      message: 'bg-green-900/10 border-green-500/20',
    },
    System: {
      circle: 'bg-slate-700 text-slate-300',
      chip: 'bg-slate-700 text-slate-400',
      message: 'bg-slate-800/50 border-slate-600/30',
    },
  };

  try {
    return (
      <div className={`rounded-lg border ${statusColor} overflow-hidden`}>
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium text-[#e2e8f0]">
              Agent Debate Transcript
            </span>
            <span className="text-xs bg-orange-900/30 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-mono">
              {iterations} round{iterations !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusColor}`}>
              {statusText}
            </span>
            <svg
              className={`w-4 h-4 text-[#64748b] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Debate logs */}
        {isExpanded && (
          <div className="p-3 space-y-3 border-t border-[#334155]">
            <p className="text-xs text-[#64748b] italic mb-2">
              Debate triggered when agent confidence dropped below 85% threshold
            </p>
            {debateLogs.map((log, index) => {
              const colors = speakerColors[log.speaker] || speakerColors.System;
              return (
                <div key={index} className="flex gap-3 items-start">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${colors.circle}`}>
                    {log.iteration}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${colors.chip}`}>
                        {log.speaker}
                      </span>
                      {log.state?.humanInTheLoop && (
                        <span className="text-xs text-red-400 font-medium">⚠ Human Review Required</span>
                      )}
                      {log.state?.consensusReached && (
                        <span className="text-xs text-green-400 font-medium">✓ Consensus</span>
                      )}
                    </div>
                    <div className={`text-xs text-[#cbd5e1] p-2 rounded border ${colors.message}`}>
                      {log.message}
                    </div>
                    {log.state?.confidence !== undefined && log.speaker !== 'System' && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-1 rounded-full bg-[#334155] w-16 overflow-hidden">
                          <div
                            className={`h-full ${log.state.confidence >= 0.8 ? 'bg-green-500' : log.state.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.round((log.state.confidence || 0) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#64748b] font-mono">
                          {Math.round((log.state.confidence || 0) * 100)}% confidence
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('[DebateTranscript] render error:', error);
    return null;
  }
}
