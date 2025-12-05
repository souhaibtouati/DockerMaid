import { Header, StatusDashboard, ContainerList, UpdateLogs, SettingsPanel } from './components';
import { useContainers, useSuperVisorStatus, useUpdateLogs, useSettings } from './hooks/useSuperVisor';

function App() {
  const {
    containers,
    loading: containersLoading,
    refetch: refetchContainers,
    startContainer,
    stopContainer,
    restartContainer,
    updateContainer,
    updateAllContainers,
  } = useContainers();

  const {
    status,
    dockerInfo,
    loading: statusLoading,
    error: statusError,
    dockerConnected,
    refetch: refetchStatus,
  } = useSuperVisorStatus();

  const { logs, loading: logsLoading, refetch: refetchLogs } = useUpdateLogs();
  
  const {
    settings,
    loading: settingsLoading,
    updateSettings,
    clearUpdateCache,
    refetch: refetchSettings,
  } = useSettings();

  const handleRefreshAll = () => {
    refetchContainers();
    refetchStatus();
    refetchLogs();
    refetchSettings();
  };

  const isConnected = dockerConnected;

  return (
    <div className="min-h-screen w-full bg-slate-900">
      <Header isConnected={isConnected} />
      
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {/* Status Dashboard */}
          <StatusDashboard
            status={status}
            dockerInfo={dockerInfo}
            loading={statusLoading}
            error={statusError}
            onRefresh={handleRefreshAll}
            onUpdateAll={updateAllContainers}
          />

          {/* Main Content Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px' }}>
            {/* Container List - Takes 2 columns */}
            <div style={{ gridColumn: 'span 2' }}>
              <ContainerList
                containers={containers}
                loading={containersLoading}
                onStart={startContainer}
                onStop={stopContainer}
                onRestart={restartContainer}
                onUpdate={updateContainer}
                onUpdateAll={updateAllContainers}
                onRefresh={refetchContainers}
              />
            </div>

            {/* Right column: Settings + Logs */}
            <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <SettingsPanel
                settings={settings}
                loading={settingsLoading}
                onUpdateSettings={updateSettings}
                onClearCache={clearUpdateCache}
                onRefresh={handleRefreshAll}
              />
              <UpdateLogs logs={logs} loading={logsLoading} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800" style={{ marginTop: '48px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="text-sm text-slate-500">
              Super-Visor • Docker Container Management Dashboard
            </p>
            <p className="text-sm text-slate-600">
              {status?.version ? `v${status.version}` : ''}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
