import { useState } from 'react';

export default function DemoGuide() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-[#1e293b] to-[#2e3e56] rounded-xl shadow-lg border border-[#334155] p-5 mb-6 relative overflow-hidden">
      {/* Decorative accent element */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#0ea5e9]/20 to-purple-600/20 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />

      <div className="flex justify-between items-start">
        <div className="flex gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Quick Demo Walkthrough</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">Follow these four simple steps to evaluate the autonomous support pipeline capabilities.</p>
          </div>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-[#94a3b8] hover:text-white transition-colors"
          aria-label="Dismiss guide"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <Step number="1" title="Initialize Pipeline" desc="Click 'Run Demo Pipeline' in the header to import and queue test cases." />
        <Step number="2" title="Watch Event Feed" desc="Monitor real-time status changes and WebSocket logs in the dashboard feed." />
        <Step number="3" title="Inspect AI Triage" desc="Go to the Tickets tab, select a ticket, and explore the transparent AI Reasoning." />
        <Step number="4" title="Review Intelligence" desc="Return here to view cross-agent memory metrics and orange incident alerts." />
      </div>
    </div>
  );
}

function Step({ number, title, desc }) {
  return (
    <div className="bg-[#0f172a]/60 backdrop-blur-sm rounded-lg p-3.5 border border-[#334155]/60 hover:border-[#0ea5e9]/30 transition-all group">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-shrink-0 flex items-center justify-center w-5.5 h-5.5 rounded-full text-xs font-bold bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/30 group-hover:bg-[#0ea5e9] group-hover:text-slate-900 transition-colors">
          {number}
        </span>
        <span className="text-xs font-bold text-[#e2e8f0]">{title}</span>
      </div>
      <p className="text-[11px] text-[#94a3b8] leading-relaxed">{desc}</p>
    </div>
  );
}
