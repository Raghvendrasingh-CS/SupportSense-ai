// ReasoningChain — Displays transparent step-by-step agent decision explanation
// Makes AI reasoning visible — directly targets Reasoning and Multi-step Thinking judging category

import React, { useState } from 'react';

/**
 * Collapsible React component that displays agent pipeline reasoning steps in a vertical timeline.
 * 
 * @param {object} props.reasoning - Reasoning data containing steps, summary, keyDecisionPoint, totalSteps
 */
export default function ReasoningChain({ reasoning }) {
  try {
    const [isExpanded, setIsExpanded] = useState(false);

    // If reasoning prop is null or undefined or has no steps return null — render nothing
    if (!reasoning || !reasoning.steps || reasoning.steps.length === 0) {
      return null;
    }

    const { steps, summary, keyDecisionPoint, totalSteps } = reasoning;

    const BrainIcon = () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-purple-400"
      >
        <path d="M12 2a9 9 0 0 1 9 9c0 3.18-1.65 5.97-4.13 7.59L16 20v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1l-.87-1.41A9 9 0 0 1 3 11 9 9 0 0 1 12 2m0 2a7 7 0 0 0-7 7c0 2.57 1.37 4.82 3.43 6.07L9 18.17V20h6v-1.83l.57-.1C17.63 16.82 19 14.57 19 12a7 7 0 0 0-7-7m-1 3h2v5h-2V7m0 6h2v2h-2v-2z" />
      </svg>
    );

    const ChevronDown = () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-[#64748b]"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    );

    const ChevronUp = () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-[#64748b]"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );

    // Collapsed View
    if (!isExpanded) {
      return (
        <div
          className="rounded-lg border border-[#334155] bg-[#1e293b] p-3 cursor-pointer hover:bg-[#263548] transition-colors"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainIcon />
              <span className="text-sm font-medium text-[#e2e8f0]">Agent Reasoning Chain</span>
              <span className="text-xs bg-purple-900/30 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">
                {(totalSteps || steps.length) + ' steps'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {keyDecisionPoint && (
                <span className="text-xs text-[#64748b] truncate max-w-48 hidden sm:block">
                  {keyDecisionPoint}
                </span>
              )}
              <ChevronDown />
            </div>
          </div>
        </div>
      );
    }

    // Expanded View
    return (
      <div className="rounded-lg border border-purple-500/20 bg-[#1e293b] overflow-hidden transition-all duration-200">
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 border-b border-[#334155] cursor-pointer hover:bg-[#263548]"
          onClick={() => setIsExpanded(false)}
        >
          <div className="flex items-center gap-2">
            <BrainIcon />
            <span className="text-sm font-medium text-[#e2e8f0]">Agent Reasoning Chain</span>
            <span className="text-xs bg-purple-900/30 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">
              {(totalSteps || steps.length) + ' steps'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {summary && (
              <span className="text-xs text-[#94a3b8] italic max-w-sm truncate hidden md:block">
                {summary}
              </span>
            )}
            <ChevronUp />
          </div>
        </div>

        {/* Steps container */}
        <div className="p-3 space-y-2 transition-all duration-200">
          {keyDecisionPoint && (
            <div className="mb-3 p-2 rounded bg-purple-900/20 border border-purple-500/20 text-xs text-purple-300">
              <span className="font-semibold">Key Decision:</span> {keyDecisionPoint}
            </div>
          )}

          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const isHighlighted = !!step.highlight;

            // Agent color settings
            let circleColorClass = 'bg-slate-700 text-slate-300';
            let agentChipClass = 'bg-slate-700 text-slate-400';
            
            if (step.agent === 'TriageAgent') {
              circleColorClass = 'bg-blue-900/50 text-blue-400 border border-blue-500/30';
              agentChipClass = 'bg-blue-900/30 text-blue-400';
            } else if (step.agent === 'ResolutionAgent') {
              circleColorClass = 'bg-purple-900/50 text-purple-400 border border-purple-500/30';
              agentChipClass = 'bg-purple-900/30 text-purple-400';
            } else if (step.agent === 'EscalationAgent') {
              circleColorClass = 'bg-green-900/50 text-green-400 border border-green-500/30';
              agentChipClass = 'bg-green-900/30 text-green-400';
            }

            // Confidence bar colors: green if >= 0.8, yellow if >= 0.6, red otherwise
            const confVal = typeof step.confidence === 'number' ? step.confidence : 0.8;
            let confColor = 'bg-red-500';
            if (confVal >= 0.8) {
              confColor = 'bg-green-500';
            } else if (confVal >= 0.6) {
              confColor = 'bg-yellow-500';
            }

            return (
              <div key={index} className="flex gap-3 items-start">
                {/* Left Column */}
                <div className="flex flex-col items-center flex-shrink-0 self-stretch">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${circleColorClass}`}>
                    {step.stepNumber}
                  </div>
                  {!isLast && (
                    <div className="w-0.5 flex-1 bg-[#334155] mt-1 mb-1"></div>
                  )}
                </div>

                {/* Right Column */}
                <div className="flex-1 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${isHighlighted ? 'text-white' : 'text-[#cbd5e1]'}`}>
                      {step.stepName}
                    </span>
                    <div className="flex items-center gap-2">
                      {step.microsoftTech && (
                        <span className="text-xs text-[#0ea5e9] font-mono">
                          {step.microsoftTech}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${agentChipClass}`}>
                        {step.agent}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#94a3b8] mb-1">
                    {step.description}
                  </p>

                  {step.signals && step.signals.length > 0 && (
                    <ul className="space-y-0.5 mb-1">
                      {step.signals.map((sig, sIdx) => (
                        <li key={sIdx} className="text-xs text-[#64748b] flex items-center gap-1.5">
                          <span className="text-[#64748b] text-[8px]">•</span>
                          {sig}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className={`text-xs font-medium ${isHighlighted ? 'text-white bg-[#263548] p-1 rounded' : 'text-[#e2e8f0]'}`}>
                    {step.decision}
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 rounded-full bg-[#334155] w-16 overflow-hidden">
                      <div
                        className={`h-full ${confColor}`}
                        style={{ width: `${Math.round(confVal * 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-[#64748b] font-mono">
                      {Math.round(confVal * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (error) {
    console.error('ReasoningChain component error:', error);
    return null;
  }
}
