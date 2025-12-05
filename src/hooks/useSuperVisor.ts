import { useState, useEffect, useCallback } from 'react';
import type { Container, SuperVisorStatus, DockerInfo, UpdateLog, Settings } from '../types';
import apiService from '../services/api';

export function useContainers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await apiService.getContainers();
    if (response.success && response.data) {
      setContainers(response.data);
    } else {
      setError(response.error || 'Failed to fetch containers');
    }
    setLoading(false);
  }, []);

  const startContainer = useCallback(async (containerId: string) => {
    const response = await apiService.startContainer(containerId);
    if (response.success) {
      await fetchContainers();
    }
    return response;
  }, [fetchContainers]);

  const stopContainer = useCallback(async (containerId: string) => {
    const response = await apiService.stopContainer(containerId);
    if (response.success) {
      await fetchContainers();
    }
    return response;
  }, [fetchContainers]);

  const restartContainer = useCallback(async (containerId: string) => {
    const response = await apiService.restartContainer(containerId);
    if (response.success) {
      await fetchContainers();
    }
    return response;
  }, [fetchContainers]);

  const updateContainer = useCallback(async (containerId: string, targetTag?: string) => {
    setContainers((prev) =>
      prev.map((c) =>
        c.id === containerId ? { ...c, isUpdating: true } : c
      )
    );

    const response = await apiService.updateContainer(containerId, targetTag);
    
    if (response.success) {
      // Check if this was a self-update that requires manual restart
      const data = response.data as { selfUpdate?: boolean; manualRestartRequired?: boolean; message?: string };
      if (data?.selfUpdate && data?.manualRestartRequired) {
        alert(data.message || 'Self-update: Image pulled. Please restart DockerMaid manually with: docker compose up -d --force-recreate');
      }
      await fetchContainers();
    } else {
      setContainers((prev) =>
        prev.map((c) =>
          c.id === containerId ? { ...c, isUpdating: false } : c
        )
      );
    }
    return response;
  }, [fetchContainers]);

  const updateAllContainers = useCallback(async () => {
    // Only mark containers with updates as updating
    setContainers((prev) =>
      prev.map((c) => c.hasUpdate ? { ...c, isUpdating: true } : c)
    );

    const response = await apiService.updateAllContainers();
    
    // Check if self-update was skipped and notify user
    if (response.success && response.data?.selfUpdateSkipped) {
      const containerName = response.data.selfUpdateContainerName || 'DockerMaid';
      alert(`${containerName} was skipped to prevent crash.\n\nTo update DockerMaid, run:\ndocker compose up -d --force-recreate`);
    }
    
    await fetchContainers();
    return response;
  }, [fetchContainers]);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  return {
    containers,
    loading,
    error,
    refetch: fetchContainers,
    startContainer,
    stopContainer,
    restartContainer,
    updateContainer,
    updateAllContainers,
  };
}

export function useSuperVisorStatus() {
  const [status, setStatus] = useState<SuperVisorStatus | null>(null);
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockerConnected, setDockerConnected] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    // First check health
    const healthResponse = await apiService.healthCheck();
    if (healthResponse.success && healthResponse.data) {
      setDockerConnected(healthResponse.data.docker === 'connected');
    } else {
      setDockerConnected(false);
      setError(healthResponse.error || 'Cannot connect to DockerMaid backend');
      setLoading(false);
      return;
    }

    const [statusResponse, dockerResponse] = await Promise.all([
      apiService.getSuperVisorStatus(),
      apiService.getDockerInfo()
    ]);

    if (statusResponse.success && statusResponse.data) {
      setStatus(statusResponse.data);
    } else {
      setError(statusResponse.error || 'Failed to fetch status');
    }

    if (dockerResponse.success && dockerResponse.data) {
      setDockerInfo(dockerResponse.data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    dockerInfo,
    loading,
    error,
    dockerConnected,
    refetch: fetchStatus,
  };
}

export function useUpdateLogs() {
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (limit?: number) => {
    setLoading(true);
    setError(null);

    const response = await apiService.getUpdateLogs(limit);
    if (response.success && response.data) {
      setLogs(response.data);
    } else {
      setError(response.error || 'Failed to fetch update logs');
    }
    setLoading(false);
  }, []);

  const clearLogs = useCallback(async () => {
    const response = await apiService.clearLogs();
    if (response.success) {
      setLogs([]);
    }
    return response;
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs,
    clearLogs,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await apiService.getSettings();
    if (response.success && response.data) {
      setSettings(response.data);
    } else {
      setError(response.error || 'Failed to fetch settings');
    }
    setLoading(false);
  }, []);

  const updateSettings = useCallback(async (newSettings: { checkInterval?: number; autoUpdate?: boolean }) => {
    const response = await apiService.updateSettings(newSettings);
    if (response.success && response.data) {
      setSettings(response.data);
    }
    return response;
  }, []);

  const clearUpdateCache = useCallback(async () => {
    return await apiService.clearUpdateCache();
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refetch: fetchSettings,
    updateSettings,
    clearUpdateCache,
  };
}
