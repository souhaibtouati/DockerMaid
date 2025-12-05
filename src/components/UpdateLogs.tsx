import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardContent, Badge } from './ui';
import type { UpdateLog } from '../types';
import { formatDistanceToNow, format } from 'date-fns';

interface UpdateLogsProps {
  logs: UpdateLog[];
  loading: boolean;
}

export function UpdateLogs({ logs, loading }: UpdateLogsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-2xl font-semibold text-white">Recent Updates</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse bg-slate-700/50 rounded"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: UpdateLog['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'in-progress':
        return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
    }
  };

  const getStatusBadge = (status: UpdateLog['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="success">Success</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      case 'in-progress':
        return <Badge variant="info">In Progress</Badge>;
    }
  };

  // Helper to format image display - show tag/version
  const formatImageInfo = (log: UpdateLog) => {
    // Show tag names (stored in oldImage/newImage now)
    const oldTag = log.oldImage || '';
    const newTag = log.newImage || '';
    
    if (oldTag || newTag) {
      const changed = oldTag !== newTag;
      return (
        <div className="text-sm text-slate-400" style={{ marginTop: '4px' }}>
          <code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-300">{oldTag || '?'}</code>
          <span style={{ margin: '0 6px' }}>→</span>
          <code className={`bg-slate-700/50 px-1.5 py-0.5 rounded ${changed ? 'text-green-400' : 'text-slate-300'}`}>
            {newTag || '?'}
          </code>
          {!changed && oldTag && newTag && <span className="text-slate-600 text-xs ml-2">(same tag)</span>}
        </div>
      );
    }
    
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="text-2xl font-semibold text-white">Recent Updates</h2>
          <Badge variant="default">{logs.length} total</Badge>
        </div>
      </CardHeader>
      <CardContent style={{ padding: 0, maxWidth: '400px', overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <div className="text-center text-slate-400" style={{ padding: '48px 24px' }}>
            <Clock className="w-12 h-12 mx-auto opacity-50" style={{ marginBottom: '16px' }} />
            <p>No update history yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {logs.map((log) => (
              <div
                key={log.id}
                className="hover:bg-slate-700/30 transition-colors"
                style={{ padding: '20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ marginTop: '2px' }}>{getStatusIcon(log.status)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="font-medium text-white">
                        {log.containerName}
                      </span>
                      {getStatusBadge(log.status)}
                    </div>
                    {formatImageInfo(log)}
                    {log.message && (
                      <p className="text-sm text-slate-500" style={{ marginTop: '4px' }}>{log.message}</p>
                    )}
                    <p className="text-xs text-slate-500" style={{ marginTop: '8px' }}>
                      <Clock className="w-3 h-3 inline" style={{ marginRight: '4px' }} />
                      {formatDistanceToNow(new Date(log.timestamp), {
                        addSuffix: true,
                      })}{' '}
                      • {format(new Date(log.timestamp), 'PPp')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
