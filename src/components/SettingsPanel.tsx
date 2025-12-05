import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Clock, Trash2 } from 'lucide-react';
import { Card, CardContent, Button } from './ui';
import type { Settings as SettingsType } from '../types';

interface SettingsPanelProps {
  settings: SettingsType | null;
  loading: boolean;
  onUpdateSettings: (settings: { checkInterval?: number; autoUpdate?: boolean }) => Promise<unknown>;
  onClearCache: () => Promise<unknown>;
  onRefresh: () => void;
}

const INTERVAL_OPTIONS = [
  { value: 0, label: 'Disabled' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Every 24 hours' },
];

export function SettingsPanel({
  settings,
  loading,
  onUpdateSettings,
  onClearCache,
  onRefresh,
}: SettingsPanelProps) {
  const [checkInterval, setCheckInterval] = useState(0);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (settings) {
      setCheckInterval(settings.checkInterval);
    }
  }, [settings]);

  const handleIntervalChange = async (value: number) => {
    setCheckInterval(value);
    setSaving(true);
    await onUpdateSettings({ checkInterval: value });
    setSaving(false);
  };

  const handleClearCache = async () => {
    setClearing(true);
    await onClearCache();
    onRefresh();
    setClearing(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="h-24 animate-pulse bg-slate-700/50 rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Update Settings</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="text-sm text-slate-400 block mb-2">
                <Clock className="w-4 h-4 inline mr-2" />
                Automatic Update Check Interval
              </label>
              <select
                value={checkInterval}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                disabled={saving}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                {checkInterval > 0
                  ? `DockerMaid will check for container updates every ${checkInterval} minutes`
                  : 'Automatic update checks are disabled'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', paddingTop: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearCache}
                disabled={clearing}
              >
                {clearing ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Clear Cache
              </Button>
              <Button variant="secondary" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Now
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
