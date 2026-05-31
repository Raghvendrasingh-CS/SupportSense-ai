// Application header with branding, connection status, and demo mode indicator.
export default function Header({ connected, demoMode, onSeedDemo, loading }) {
  try {
    return (
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ms-blue rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">SupportSense AI</h1>
                <p className="text-xs text-gray-500">Enterprise Support Intelligence · Work IQ + Fabric IQ</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {demoMode && (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                  DEMO MODE
                </span>
              )}

              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse-dot' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">{connected ? 'Live' : 'Disconnected'}</span>
              </div>

              <button
                onClick={onSeedDemo}
                disabled={loading}
                className="px-4 py-2 bg-ms-blue text-white text-sm font-medium rounded-lg hover:bg-ms-dark transition-colors disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Run Demo Pipeline'}
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  } catch (error) {
    console.error(`[Header] ${new Date().toISOString()} ERROR:`, error);
    return null;
  }
}
