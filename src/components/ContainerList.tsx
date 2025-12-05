import { useState } from 'react';
import {
  Box,
  Play,
  Square,
  RefreshCw,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  StopCircle,
  PlayCircle,
  Terminal,
  ExternalLink,
  Download,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, Button, Badge } from './ui';
import { ContainerLogsModal } from './ContainerLogsModal';
import type { Container, RegistryInfo } from '../types';
import { formatDistanceToNow } from 'date-fns';
import apiService from '../services/api';

interface ContainerListProps {
  containers: Container[];
  loading: boolean;
  onStart: (containerId: string) => Promise<unknown>;
  onStop: (containerId: string) => Promise<unknown>;
  onRestart: (containerId: string) => Promise<unknown>;
  onUpdate: (containerId: string, targetTag?: string) => Promise<unknown>;
  onUpdateAll: () => Promise<unknown>;
  onRefresh: () => void;
}

export function ContainerList({
  containers,
  loading,
  onStart,
  onStop,
  onRestart,
  onUpdate,
  onUpdateAll,
  onRefresh,
}: ContainerListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [logsContainerName, setLogsContainerName] = useState<string>('');
  const [pullingImage, setPullingImage] = useState<string | null>(null);

  const runningContainers = containers.filter((c) => c.status === 'running');
  const containersWithUpdates = containers.filter((c) => c.hasUpdate);

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    await onUpdateAll();
    setUpdatingAll(false);
    onRefresh();
  };

  const handleAction = async (
    action: () => Promise<unknown>,
    containerId: string
  ) => {
    setActionLoading(containerId);
    await action();
    setActionLoading(null);
    onRefresh();
  };

  const handlePullImage = async (imageName: string) => {
    setPullingImage(imageName);
    await apiService.pullImage(imageName);
    setPullingImage(null);
    onRefresh();
  };

  const handleShowLogs = (containerId: string, containerName: string) => {
    setLogsContainerId(containerId);
    setLogsContainerName(containerName);
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (container: Container) => {
    const statusConfig: Record<
      string,
      { variant: 'success' | 'warning' | 'danger' | 'info'; label: string }
    > = {
      running: { variant: 'success', label: 'Running' },
      stopped: { variant: 'danger', label: 'Stopped' },
      paused: { variant: 'warning', label: 'Paused' },
      restarting: { variant: 'info', label: 'Restarting' },
      exited: { variant: 'danger', label: 'Exited' },
    };

    const config = statusConfig[container.status] || {
      variant: 'default' as const,
      label: container.status,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Containers</h2>
        </div>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent>
              <div className="h-16 animate-pulse bg-slate-700/50 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 className="text-2xl font-semibold text-white">Containers</h2>
          <Badge variant="info">
            {containers.length} total • {runningContainers.length} running
          </Badge>
          {containersWithUpdates.length > 0 && (
            <Badge variant="warning">
              {containersWithUpdates.length} update{containersWithUpdates.length > 1 ? 's' : ''} available
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" style={{ marginRight: '8px' }} />
            Refresh
          </Button>
          {runningContainers.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpdateAll}
              loading={updatingAll}
            >
              <ArrowUpCircle className="w-4 h-4" style={{ marginRight: '8px' }} />
              Update All Running
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {containers.map((container) => (
          <ContainerCard
            key={container.id}
            container={container}
            expanded={expandedId === container.id}
            onToggle={() =>
              setExpandedId(expandedId === container.id ? null : container.id)
            }
            onStart={() => handleAction(() => onStart(container.id), container.id)}
            onStop={() => handleAction(() => onStop(container.id), container.id)}
            onRestart={() => handleAction(() => onRestart(container.id), container.id)}
            onUpdate={(targetTag) => handleAction(() => onUpdate(container.id, targetTag), container.id)}
            onPullImage={() => handlePullImage(container.image)}
            onShowLogs={() => handleShowLogs(container.id, container.name)}
            onCopy={copyToClipboard}
            copiedId={copiedId}
            getStatusBadge={getStatusBadge}
            isLoading={actionLoading === container.id}
            isPulling={pullingImage === container.image}
          />
        ))}
      </div>

      {containers.length === 0 && (
        <Card>
          <CardContent className="text-center" style={{ padding: '48px 24px' }}>
            <Box className="w-12 h-12 mx-auto text-slate-500" style={{ marginBottom: '16px' }} />
            <p className="text-slate-400">No containers found</p>
          </CardContent>
        </Card>
      )}

      {logsContainerId && (
        <ContainerLogsModal
          containerId={logsContainerId}
          containerName={logsContainerName}
          onClose={() => setLogsContainerId(null)}
        />
      )}
    </div>
  );
}

interface ContainerCardProps {
  container: Container;
  expanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onUpdate: (targetTag?: string) => void;
  onPullImage: () => void;
  onShowLogs: () => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  getStatusBadge: (container: Container) => React.ReactNode;
  isLoading: boolean;
  isPulling: boolean;
}

function ContainerCard({
  container,
  expanded,
  onToggle,
  onStart,
  onStop,
  onRestart,
  onUpdate,
  onPullImage,
  onShowLogs,
  onCopy,
  copiedId,
  getStatusBadge,
  isLoading,
  isPulling,
}: ContainerCardProps) {
  const [registryInfo, setRegistryInfo] = useState<RegistryInfo | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [loadingTags, setLoadingTags] = useState(false);
  const isRunning = container.status === 'running';

  const fetchRegistryInfo = async () => {
    if (!registryInfo) {
      const response = await apiService.getRegistryUrl(container.image);
      if (response.success && response.data) {
        setRegistryInfo(response.data);
      }
    }
  };

  const fetchAvailableTags = async () => {
    if (availableTags.length === 0 && !loadingTags) {
      setLoadingTags(true);
      const response = await apiService.getImageTags(container.image);
      if (response.success && response.data) {
        setAvailableTags(response.data.tags);
        setSelectedTag(response.data.currentTag);
      }
      setLoadingTags(false);
    }
  };

  // Fetch registry info and tags when expanded
  if (expanded && !registryInfo) {
    fetchRegistryInfo();
  }
  if (expanded && availableTags.length === 0 && !loadingTags) {
    fetchAvailableTags();
  }

  return (
    <Card className={container.isUpdating ? 'ring-1 ring-blue-500/50' : ''}>
      <CardContent style={{ padding: 0 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', cursor: 'pointer' }}
          onClick={onToggle}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: 0, flex: 1 }}>
            <div
              style={{ padding: '12px', borderRadius: '8px' }}
              className={isRunning ? 'bg-green-400/10' : 'bg-slate-700'}
            >
              {isRunning ? (
                <Play className="w-5 h-5 text-green-400" />
              ) : (
                <Square className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 className="font-medium text-white truncate">
                  {container.name}
                </h3>
                {getStatusBadge(container)}
                {container.hasUpdate && (
                  <Badge variant="warning">
                    <ArrowUpCircle className="w-3 h-3" style={{ marginRight: '4px' }} />
                    Update Available
                  </Badge>
                )}
                {container.updateCheckError && (
                  <span className="text-xs text-slate-500" title={container.updateCheckError}>
                    <AlertCircle className="w-3 h-3 inline" />
                  </span>
                )}
                {container.isUpdating && (
                  <Badge variant="info">
                    <RefreshCw className="w-3 h-3 animate-spin" style={{ marginRight: '4px' }} />
                    Updating...
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-400 truncate" style={{ marginTop: '4px' }}>
                {container.image}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
            {isLoading ? (
              <Badge variant="info">
                <RefreshCw className="w-3 h-3 animate-spin" style={{ marginRight: '4px' }} />
                Processing...
              </Badge>
            ) : (
              expanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )
            )}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-700" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Container Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isRunning ? (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop();
                    }}
                    disabled={isLoading}
                  >
                    <StopCircle className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Stop
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart();
                    }}
                    disabled={isLoading}
                  >
                    <RotateCcw className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Restart
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate(selectedTag || undefined);
                    }}
                    disabled={isLoading || container.isUpdating}
                  >
                    <ArrowUpCircle className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Pull & Recreate
                  </Button>
                  {availableTags.length > 0 && (
                    <select
                      value={selectedTag}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedTag(e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      style={{ maxWidth: '150px' }}
                    >
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  )}
                  {loadingTags && (
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPullImage();
                    }}
                    disabled={isLoading || isPulling}
                  >
                    {isPulling ? (
                      <RefreshCw className="w-4 h-4 animate-spin" style={{ marginRight: '8px' }} />
                    ) : (
                      <Download className="w-4 h-4" style={{ marginRight: '8px' }} />
                    )}
                    Pull Image Only
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowLogs();
                    }}
                  >
                    <Terminal className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Logs
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStart();
                    }}
                    disabled={isLoading}
                  >
                    <PlayCircle className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Start
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowLogs();
                    }}
                  >
                    <Terminal className="w-4 h-4" style={{ marginRight: '8px' }} />
                    Logs
                  </Button>
                </>
              )}
            </div>

            {/* Container Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }} className="text-sm">
              <div>
                <p className="text-slate-400" style={{ marginBottom: '4px' }}>Container ID</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code className="text-slate-200 bg-slate-700/50 rounded text-xs" style={{ padding: '4px 8px' }}>
                    {container.id.substring(0, 12)}
                  </code>
                  <button
                    className="text-slate-400 hover:text-white transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(container.id, `id-${container.id}`);
                    }}
                  >
                    {copiedId === `id-${container.id}` ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-slate-400" style={{ marginBottom: '4px' }}>Image ID</p>
                <code className="text-slate-200 bg-slate-700/50 rounded text-xs" style={{ padding: '4px 8px' }}>
                  {container.imageId.substring(0, 19)}
                </code>
              </div>
              <div>
                <p className="text-slate-400" style={{ marginBottom: '4px' }}>Created</p>
                <p className="text-slate-200">
                  {formatDistanceToNow(new Date(container.created), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <div>
                <p className="text-slate-400" style={{ marginBottom: '4px' }}>State</p>
                <p className="text-slate-200">{container.state}</p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <p className="text-slate-400" style={{ marginBottom: '4px' }}>Ports</p>
                {container.ports.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {container.ports.map((port, i) => (
                      <Badge key={i} variant="default" size="sm">
                        {port.publicPort
                          ? `${port.publicPort}:${port.privatePort}`
                          : port.privatePort}
                        /{port.type}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">None exposed</p>
                )}
              </div>
            </div>

            {/* Labels */}
            {Object.keys(container.labels).length > 0 && (
              <div>
                <p className="text-slate-400 mb-2 text-sm">Labels</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.entries(container.labels)
                    .slice(0, 5)
                    .map(([key, value]) => (
                      <Badge key={key} variant="default" size="sm">
                        {key.split('.').pop()}={value.substring(0, 20)}
                      </Badge>
                    ))}
                  {Object.keys(container.labels).length > 5 && (
                    <Badge variant="default" size="sm">
                      +{Object.keys(container.labels).length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Registry Links */}
            {registryInfo && (
              <div className="border-t border-slate-700 pt-4">
                <p className="text-slate-400 mb-2 text-sm">Registry</p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <a
                    href={registryInfo.registryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Registry
                  </a>
                  <a
                    href={registryInfo.changelogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Tags / Changelog
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
