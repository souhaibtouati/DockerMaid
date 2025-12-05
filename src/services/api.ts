import axios, { type AxiosInstance } from 'axios';
import type {
  Container,
  SuperVisorStatus,
  DockerInfo,
  UpdateLog,
  ApiResponse,
  DockerImage,
  Settings,
  ContainerLog,
  RegistryInfo,
} from '../types';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    // In development, Vite proxy handles /api
    // In production, same origin serves both frontend and API
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const apiToken = import.meta.env.VITE_API_TOKEN || '';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    }
    
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 60000, // Longer timeout for update operations
      headers,
    });
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string; docker: string }>> {
    try {
      const response = await this.client.get('/health');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Container endpoints
  async getContainers(): Promise<ApiResponse<Container[]>> {
    try {
      const response = await this.client.get('/containers');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getContainer(id: string): Promise<ApiResponse<Container>> {
    try {
      const response = await this.client.get(`/containers/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Container actions
  async startContainer(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post(`/containers/${id}/start`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async stopContainer(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post(`/containers/${id}/stop`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async restartContainer(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post(`/containers/${id}/restart`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Container logs
  async getContainerLogs(id: string, tail: number = 100): Promise<ApiResponse<{ logs: ContainerLog[] }>> {
    try {
      const response = await this.client.get(`/containers/${id}/logs`, {
        params: { tail }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateContainer(id: string, targetTag?: string): Promise<ApiResponse<{ message: string; log: UpdateLog; selfUpdate?: boolean; manualRestartRequired?: boolean }>> {
    try {
      const response = await this.client.post(`/containers/${id}/update`, { targetTag });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Get available tags for an image
  async getImageTags(imageName: string): Promise<ApiResponse<{ imageName: string; repository: string; currentTag: string; tags: string[] }>> {
    try {
      const response = await this.client.get(`/images/${encodeURIComponent(imageName)}/tags`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateAllContainers(): Promise<ApiResponse<{ 
    results: Array<{ containerId: string; containerName: string; status: string; message?: string; selfUpdate?: boolean }>; 
    selfUpdateSkipped?: boolean;
    selfUpdateContainerName?: string;
    message?: string;
  }>> {
    try {
      const response = await this.client.post('/containers/update-all');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Super-Visor status
  async getSuperVisorStatus(): Promise<ApiResponse<SuperVisorStatus>> {
    try {
      const response = await this.client.get('/supervisor/status');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Docker info
  async getDockerInfo(): Promise<ApiResponse<DockerInfo>> {
    try {
      const response = await this.client.get('/docker/info');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Images
  async getImages(): Promise<ApiResponse<DockerImage[]>> {
    try {
      const response = await this.client.get('/images');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Pull image only
  async pullImage(imageName: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post(`/images/${encodeURIComponent(imageName)}/pull`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Get registry URL for image
  async getRegistryUrl(imageName: string): Promise<ApiResponse<RegistryInfo>> {
    try {
      const response = await this.client.get(`/images/${encodeURIComponent(imageName)}/registry-url`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Update logs
  async getUpdateLogs(limit?: number): Promise<ApiResponse<UpdateLog[]>> {
    try {
      const response = await this.client.get('/logs', {
        params: { limit },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async clearLogs(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.delete('/logs');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Settings
  async getSettings(): Promise<ApiResponse<Settings>> {
    try {
      const response = await this.client.get('/settings');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateSettings(settings: { checkInterval?: number; autoUpdate?: boolean }): Promise<ApiResponse<Settings>> {
    try {
      const response = await this.client.put('/settings', settings);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Clear update cache
  async clearUpdateCache(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post('/cache/clear');
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): ApiResponse<never> {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      return {
        success: false,
        error: message,
      };
    }
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

export const apiService = new ApiService();
export default apiService;
