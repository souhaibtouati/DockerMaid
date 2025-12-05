export interface Container {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: Port[];
  labels: Record<string, string>;
  hasUpdate: boolean;
  updateCheckError?: string | null;
  latestImageId?: string;
  isUpdating?: boolean;
}

export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'restarting' | 'exited';

export interface Port {
  privatePort: number;
  publicPort?: number;
  type: string;
}

export interface ContainerLog {
  stream: 'stdout' | 'stderr';
  message: string;
}

export interface RegistryInfo {
  imageName: string;
  registry: string;
  repository: string;
  tag: string;
  registryUrl: string;
  changelogUrl: string;
}

export interface SuperVisorStatus {
  isRunning: boolean;
  version: string;
  lastCheck: string;
  totalContainers: number;
  runningContainers: number;
  stoppedContainers: number;
  updatesAvailable?: number;
  settings?: {
    checkInterval: number;
    autoUpdate: boolean;
  };
}

export interface Settings {
  checkInterval: number;
  autoUpdate: boolean;
  lastCheck: string | null;
}

export interface DockerInfo {
  dockerVersion: string;
  os: string;
  architecture: string;
  cpus: number;
  memory: number;
  containers: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
}

export interface UpdateLog {
  id: string;
  timestamp: string;
  containerName: string;
  oldImage: string;
  newImage: string;
  status: 'success' | 'failed' | 'in-progress';
  message?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
}
