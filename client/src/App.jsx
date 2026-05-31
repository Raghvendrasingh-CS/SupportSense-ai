// Main application component — orchestrates dashboard, tickets, and real-time updates.
import { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { useSocket } from './hooks/useSocket';
import Header from './components/Header';
import AnalyticsPanel from './components/AnalyticsPanel';
import AgentPanel from './components/AgentPanel';
import EventFeed from './components/EventFeed';
import TicketList from './components/TicketList';
import TicketDetail from './components/TicketDetail';
import NewTicketForm from './components/NewTicketForm';
import PipelineVisualizer from './components/PipelineVisualizer';

const MODULE = 'App';

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [serviceHealth, setServiceHealth] = useState(null);
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const { connected, events, latestEvent, clearEvents } = useSocket();

  const refreshData = useCallback(async () => {
    try {
      console.log(`[${MODULE}] ${new Date().toISOString()} Refreshing data`);
      const [ticketsRes, analyticsRes, workloadRes, healthRes] = await Promise.all([
        api.getTickets(),
        api.getAnalytics(),
        api.getAgentWorkload(),
        api.getServiceHealth(),
      ]);
      setTickets(ticketsRes.tickets || []);
      setAnalytics(analyticsRes.analytics);
      setWorkload(workloadRes);
      setServiceHealth(healthRes);
    } catch (error) {
      console.error(`[${MODULE}] ${new Date().toISOString()} ERROR refreshing data:`, error);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        console.log(`[${MODULE}] ${new Date().toISOString()} Initializing app`);
        const config = await api.getConfig();
        setDemoMode(config.demoMode);
        await refreshData();
      } catch (error) {
        console.error(`[${MODULE}] ${new Date().toISOString()} ERROR initializing:`, error);
      }
    }
    init();
  }, [refreshData]);

  useEffect(() => {
    if (latestEvent?.event === 'pipeline:completed' || latestEvent?.event === 'batch:completed') {
      refreshData();
      setProcessing(false);
      setLoading(false);
    }
    if (latestEvent?.event?.includes(':started')) {
      setProcessing(true);
    }
  }, [latestEvent, refreshData]);

  const handleSeedDemo = async () => {
    try {
      setLoading(true);
      setProcessing(true);
      console.log(`[${MODULE}] ${new Date().toISOString()} Running demo pipeline`);
      clearEvents();
      await api.seedDemo();
    } catch (error) {
      console.error(`[${MODULE}] ${new Date().toISOString()} ERROR seeding demo:`, error);
      setLoading(false);
      setProcessing(false);
    }
  };

  const handleNewTicket = async (data) => {
    try {
      setLoading(true);
      setProcessing(true);
      console.log(`[${MODULE}] ${new Date().toISOString()} Creating new ticket`);
      const result = await api.createTicket(data);
      setSelectedId(result.ticketId);
    } catch (error) {
      console.error(`[${MODULE}] ${new Date().toISOString()} ERROR creating ticket:`, error);
      setLoading(false);
      setProcessing(false);
    }
  };

  const selectedTicket = tickets.find((t) => t.id === selectedId) || null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'agents', label: 'Agents' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Header
        connected={connected}
        demoMode={demoMode}
        onSeedDemo={handleSeedDemo}
        loading={loading}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PipelineVisualizer latestEvent={latestEvent} processing={processing} />

        <div className="mt-6 border-b border-[#334155]">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#0ea5e9] text-[#0ea5e9]'
                    : 'border-transparent text-[#94a3b8] hover:text-[#e2e8f0]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'dashboard' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AnalyticsPanel analytics={analytics} serviceHealth={serviceHealth} />
            </div>
            <div className="space-y-6">
              <EventFeed events={events} onClear={clearEvents} />
              <NewTicketForm onSubmit={handleNewTicket} loading={loading} />
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <TicketList
                tickets={tickets}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <div className="lg:col-span-2">
              <TicketDetail ticket={selectedTicket} />
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AgentPanel workload={workload} />
            <EventFeed events={events} onClear={clearEvents} />
          </div>
        )}
      </main>

      <footer className="border-t border-[#334155] bg-[#1e293b] mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-[#64748b]">
          SupportSense AI · Microsoft Agents League Hackathon 2025 · Enterprise Agents Track · Work IQ + Fabric IQ
        </div>
      </footer>
    </div>
  );
}
