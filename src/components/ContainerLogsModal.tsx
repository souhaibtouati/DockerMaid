import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Download, Terminal } from 'lucide-react';
import { Card, CardContent, Button } from './ui';
import type { ContainerLog } from '../types';
import apiService from '../services/api';

interface ContainerLogsModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerLogsModal({
  containerId,
  containerName,
  onClose,
}: ContainerLogsModalProps) {
  const [logs, setLogs] = useState<ContainerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tail, setTail] = useState(100);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    
    const response = await apiService.getContainerLogs(containerId, tail);
    if (response.success && response.data) {
      setLogs(response.data.logs);
    } else {
      setError(response.error || 'Failed to fetch logs');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, tail]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const downloadLogs = () => {
    const content = logs.map(l => `[${l.stream}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${containerName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl max-h-[80vh] m-4"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Card>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '70vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">
                  Logs: {containerName}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={tail}
                  onChange={(e) => setTail(Number(e.target.value))}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                >
                  <option value={50}>Last 50 lines</option>
                  <option value={100}>Last 100 lines</option>
                  <option value={500}>Last 500 lines</option>
                  <option value={1000}>Last 1000 lines</option>
                </select>
                <Button variant="secondary" size="sm" onClick={fetchLogs} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button variant="secondary" size="sm" onClick={downloadLogs}>
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Logs */}
            <div 
              className="flex-1 bg-slate-900 rounded-lg p-4 overflow-auto font-mono text-xs"
              style={{ minHeight: 0 }}
            >
              {loading && logs.length === 0 ? (
                <div className="text-slate-400">Loading logs...</div>
              ) : error ? (
                <div className="text-red-400">{error}</div>
              ) : logs.length === 0 ? (
                <div className="text-slate-400">No logs available</div>
              ) : (
                <>
                  {logs.map((log, index) => (
                    <div 
                      key={index}
                      className={`whitespace-pre-wrap break-all ${
                        log.stream === 'stderr' ? 'text-red-400' : 'text-slate-300'
                      }`}
                    >
                      {log.message}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
