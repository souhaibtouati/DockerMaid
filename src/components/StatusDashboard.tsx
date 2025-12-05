import {
  Activity,
  Clock,
  Server,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Cpu,
  HardDrive,
  Box,
  Play,
  Square,
} from 'lucide-react';
import { Card, CardContent, Button } from './ui';
import type { SuperVisorStatus, DockerInfo } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface StatusDashboardProps {
  status: SuperVisorStatus | null;
  dockerInfo: DockerInfo | null;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onUpdateAll: () => Promise<unknown>;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export function StatusDashboard({
  status,
  dockerInfo,
  loading,
  error,
  onRefresh,
  onUpdateAll,
}: StatusDashboardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent>
              <div className="h-20 animate-pulse bg-slate-700/50 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!status || error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-32 text-slate-400">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-red-400" />
            Unable to connect to DockerMaid backend
          </div>
          {error && (
            <p className="text-sm text-slate-500 mt-2">{error}</p>
          )}
          <Button variant="secondary" size="sm" onClick={onRefresh} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Connection
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      label: 'Docker Status',
      value: 'Connected',
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      label: 'Total Containers',
      value: status.totalContainers.toString(),
      icon: Box,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      label: 'Running',
      value: status.runningContainers.toString(),
      icon: Play,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      label: 'Stopped',
      value: status.stoppedContainers.toString(),
      icon: Square,
      color: status.stoppedContainers > 0 ? 'text-yellow-400' : 'text-slate-400',
      bgColor: status.stoppedContainers > 0 ? 'bg-yellow-400/10' : 'bg-slate-400/10',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" style={{ marginRight: '8px' }} />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={onUpdateAll}>
            <Activity className="w-4 h-4" style={{ marginRight: '8px' }} />
            Update All
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className={`rounded-lg ${stat.bgColor}`} style={{ padding: '12px' }}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-slate-400">{stat.label}</p>
                  <p className={`text-xl font-semibold ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dockerInfo && (
        <Card>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Server className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Docker Version</p>
                  <p className="text-sm text-slate-200">{dockerInfo.dockerVersion}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Cpu className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">CPUs</p>
                  <p className="text-sm text-slate-200">{dockerInfo.cpus} cores</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <HardDrive className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Memory</p>
                  <p className="text-sm text-slate-200">{formatBytes(dockerInfo.memory)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Clock className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Last Check</p>
                  <p className="text-sm text-slate-200">
                    {status.lastCheck
                      ? formatDistanceToNow(new Date(status.lastCheck), { addSuffix: true })
                      : 'Just now'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
