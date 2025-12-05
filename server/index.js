import express from 'express';
import cors from 'cors';
import Docker from 'dockerode';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const API_TOKEN = process.env.API_TOKEN || '';
const APP_VERSION = '1.4.1';

// Settings file path
const settingsPath = join(__dirname, 'settings.json');

// Default settings
const defaultSettings = {
  checkInterval: 0, // 0 = disabled, otherwise minutes between checks
  lastCheck: null,
  autoUpdate: false
};

// Load settings from file or use defaults
let settings = { ...defaultSettings };
try {
  if (existsSync(settingsPath)) {
    settings = { ...defaultSettings, ...JSON.parse(readFileSync(settingsPath, 'utf-8')) };
  }
} catch (error) {
  console.error('Error loading settings:', error.message);
}

// Save settings to file
function saveSettings() {
  try {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving settings:', error.message);
  }
}

// Docker connection - auto-detect socket
const dockerSocket = process.platform === 'win32' 
  ? '//./pipe/docker_engine'
  : '/var/run/docker.sock';

let docker;
let dockerConnected = false;

// Cache for image update status (to avoid hammering registries)
const updateCache = new Map(); // imageName -> { hasUpdate, checkedAt, remoteDigest }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

try {
  docker = new Docker({ socketPath: dockerSocket });
  // Test connection immediately
  docker.ping().then(() => {
    dockerConnected = true;
    console.log('✅ Docker connection successful');
  }).catch((err) => {
    console.error('❌ Docker connection failed:', err.message);
    console.error('   Make sure Docker is running and accessible at:', dockerSocket);
  });
} catch (error) {
  console.error('❌ Failed to initialize Docker client:', error.message);
  docker = new Docker({ socketPath: dockerSocket }); // Create anyway for later retries
}

// Parse image name into registry, repository, and tag
function parseImageName(imageName) {
  let registry = 'registry-1.docker.io';
  let repository = imageName;
  let tag = 'latest';
  
  // Check for tag
  const tagIndex = repository.lastIndexOf(':');
  if (tagIndex > 0 && !repository.substring(tagIndex).includes('/')) {
    tag = repository.substring(tagIndex + 1);
    repository = repository.substring(0, tagIndex);
  }
  
  // Check for registry (contains . or :)
  const firstSlash = repository.indexOf('/');
  if (firstSlash > 0) {
    const potential = repository.substring(0, firstSlash);
    if (potential.includes('.') || potential.includes(':')) {
      registry = potential;
      repository = repository.substring(firstSlash + 1);
    }
  }
  
  // Docker Hub library images (e.g., "nginx" -> "library/nginx")
  if (registry === 'registry-1.docker.io' && !repository.includes('/')) {
    repository = `library/${repository}`;
  }
  
  return { registry, repository, tag };
}

// Get auth token for Docker Hub
async function getDockerHubToken(repository) {
  return new Promise((resolve, reject) => {
    const url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
    console.log(`🔑 Getting token for ${repository}`);
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.token);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Get available tags for an image from Docker Hub
async function getAvailableTags(imageName) {
  const { registry, repository } = parseImageName(imageName);
  
  if (registry !== 'registry-1.docker.io') {
    // For non-Docker Hub registries, return empty - would need different API
    return [];
  }
  
  try {
    const token = await getDockerHubToken(repository);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: registry,
        path: `/v2/${repository}/tags/list`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(body);
              // Sort tags - put common ones first
              const tags = data.tags || [];
              const priorityTags = ['latest', 'stable', 'lts', 'main', 'master'];
              const sorted = tags.sort((a, b) => {
                const aIdx = priorityTags.indexOf(a.toLowerCase());
                const bIdx = priorityTags.indexOf(b.toLowerCase());
                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                if (aIdx !== -1) return -1;
                if (bIdx !== -1) return 1;
                // Sort version-like tags descending
                return b.localeCompare(a, undefined, { numeric: true });
              });
              resolve(sorted.slice(0, 50)); // Limit to 50 tags
            } else {
              resolve([]);
            }
          } catch (e) {
            resolve([]);
          }
        });
      });
      
      req.on('error', () => resolve([]));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve([]);
      });
      req.end();
    });
  } catch (error) {
    return [];
  }
}

// Get manifest digest from registry using GET (more reliable than HEAD)
async function getRemoteDigest(imageName) {
  const { registry, repository, tag } = parseImageName(imageName);
  
  console.log(`🔍 Checking remote digest for ${imageName}`);
  console.log(`   Registry: ${registry}, Repository: ${repository}, Tag: ${tag}`);
  
  try {
    let token = '';
    
    // Get token for Docker Hub
    if (registry === 'registry-1.docker.io') {
      token = await getDockerHubToken(repository);
    }
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: registry,
        path: `/v2/${repository}/manifests/${tag}`,
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const digest = res.headers['docker-content-digest'];
          console.log(`   Remote digest: ${digest || 'not found'}, Status: ${res.statusCode}`);
          if (digest) {
            resolve(digest);
          } else if (res.statusCode === 401) {
            reject(new Error('Unauthorized - private image or auth required'));
          } else if (res.statusCode === 404) {
            reject(new Error('Image not found in registry'));
          } else {
            reject(new Error(`Failed to get digest: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  } catch (error) {
    throw error;
  }
}

// Check if a tag looks like a pinned version (not "latest" or simple tags)
function isPinnedVersionTag(tag) {
  // Tags that are NOT pinned versions (these get updated in-place)
  const dynamicTags = ['latest', 'stable', 'main', 'master', 'edge', 'dev', 'nightly', 'beta', 'alpha', 'rc'];
  if (dynamicTags.includes(tag.toLowerCase())) {
    return false;
  }
  
  // Tags that look like versions (contain numbers, dots, or dashes suggesting a specific version)
  // Examples: "v1.0.0", "2023.12.21-5ed3693", "1.122.4", "3.1.0"
  if (/\d/.test(tag) && (tag.includes('.') || tag.includes('-') || tag.match(/^v?\d/))) {
    return true;
  }
  
  return false;
}

// Check if image has an update available
async function checkImageUpdate(imageName, localImageId) {
  // Skip images without proper names
  if (!imageName || imageName.startsWith('sha256:')) {
    return { hasUpdate: false, error: 'No image tag' };
  }
  
  // Check cache first - but invalidate if local image ID changed (e.g., rollback, manual pull)
  const cached = updateCache.get(imageName);
  if (cached && (Date.now() - cached.checkedAt) < CACHE_TTL) {
    // Verify local image hasn't changed (handles rollbacks)
    if (cached.localImageId === localImageId) {
      return cached;
    }
    console.log(`   Cache invalidated: local image changed (rollback or update detected)`);
  }
  
  const { registry, repository, tag } = parseImageName(imageName);
  const isPinned = isPinnedVersionTag(tag);
  
  console.log(`   Tag "${tag}" is ${isPinned ? 'PINNED version' : 'dynamic tag'}`);
  
  try {
    const remoteDigest = await getRemoteDigest(imageName);
    
    // Get local image info - try multiple methods
    const localImages = await docker.listImages({ all: true });
    let localDigest = null;
    let matchedImage = null;
    
    // Find the image by name or ID
    for (const img of localImages) {
      const repoTags = img.RepoTags || [];
      const repoDigests = img.RepoDigests || [];
      
      // Check if this image matches our image name
      const matchesName = repoTags.some(t => {
        // Handle both "nginx:latest" and "nginx" (implicit latest)
        if (t === imageName) return true;
        if (t === `${imageName}:latest` && !imageName.includes(':')) return true;
        if (imageName.endsWith(':latest') && t === imageName.replace(':latest', '')) return true;
        return false;
      });
      
      // Also check by ID
      const matchesId = img.Id === localImageId || img.Id.replace('sha256:', '') === localImageId.replace('sha256:', '');
      
      if (matchesName || matchesId) {
        matchedImage = img;
        // Get digest from RepoDigests
        for (const rd of repoDigests) {
          if (rd.includes('@sha256:')) {
            localDigest = rd.split('@')[1];
            break;
          }
        }
        break;
      }
    }
    
    console.log(`   Local digest: ${localDigest || 'not found'}`);
    
    // Compare digests for the current tag
    let hasUpdate = !!(remoteDigest && localDigest && remoteDigest !== localDigest);
    let latestDigest = null;
    
    // For pinned versions, also check if "latest" tag has a different digest
    // This indicates there's a newer version available
    if (!hasUpdate && isPinned && registry === 'registry-1.docker.io') {
      try {
        const latestImageName = `${repository}:latest`;
        console.log(`   Checking latest tag for pinned version: ${latestImageName}`);
        latestDigest = await getRemoteDigest(latestImageName);
        
        if (latestDigest && remoteDigest && latestDigest !== remoteDigest) {
          console.log(`   Latest digest: ${latestDigest} differs from current tag!`);
          hasUpdate = true;
        } else {
          console.log(`   Latest digest: ${latestDigest} (same as current)`);
        }
      } catch (latestError) {
        console.log(`   Could not check latest tag: ${latestError.message}`);
        // Don't fail the whole check if we can't get latest
      }
    }
    
    const result = {
      hasUpdate,
      checkedAt: Date.now(),
      remoteDigest,
      localDigest,
      localImageId,
      latestDigest,
      isPinnedVersion: isPinned,
      error: null
    };
    
    console.log(`   Update available: ${hasUpdate}`);
    
    updateCache.set(imageName, result);
    return result;
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    const result = {
      hasUpdate: false,
      checkedAt: Date.now(),
      localImageId,
      error: error.message
    };
    updateCache.set(imageName, result);
    return result;
  }
}

// In-memory storage for update logs
const updateLogs = [];
let logIdCounter = 1;

// Middleware
app.use(cors());
app.use(express.json());

// API Token authentication middleware
// Skip auth for requests from the same origin (frontend served by this server)
const authMiddleware = (req, res, next) => {
  if (!API_TOKEN) {
    return next(); // No token configured, allow all
  }
  
  // Check if request has the token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === API_TOKEN) {
      return next(); // Valid token
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
  
  // Check if this is a same-origin request (from our served frontend)
  // The referer or origin header should match our server
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;
  
  // Allow requests from same origin (no origin header means same-origin in browsers)
  // or if referer matches our host
  if (!origin || (referer && referer.includes(host))) {
    return next(); // Same-origin request, allow without token
  }
  
  return res.status(401).json({ error: 'Unauthorized: Missing token' });
};

// Apply auth to all /api routes
app.use('/api', authMiddleware);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await docker.ping();
    dockerConnected = true;
    res.json({ status: 'ok', docker: 'connected' });
  } catch (error) {
    dockerConnected = false;
    const errorMessage = error.code === 'ENOENT' 
      ? `Docker socket not found at ${dockerSocket}. Is Docker running?`
      : error.code === 'ECONNREFUSED'
      ? 'Docker connection refused. Is Docker running?'
      : error.message;
    console.error('Docker health check failed:', errorMessage);
    res.status(500).json({ 
      status: 'error', 
      docker: 'disconnected', 
      error: errorMessage,
      socketPath: dockerSocket
    });
  }
});

// Get all containers
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const checkUpdates = req.query.checkUpdates !== 'false'; // Default to checking updates
    
    const formattedContainers = await Promise.all(
      containers.map(async (container) => {
        let hasUpdate = false;
        let updateCheckError = null;
        
        // Check for updates by comparing image digests
        if (checkUpdates && container.State === 'running' && !container.Image.startsWith('sha256:')) {
          try {
            const updateResult = await checkImageUpdate(container.Image, container.ImageID);
            hasUpdate = updateResult.hasUpdate;
            updateCheckError = updateResult.error;
          } catch (error) {
            updateCheckError = error.message;
          }
        }
        
        return {
          id: container.Id,
          name: container.Names[0]?.replace(/^\//, '') || 'unknown',
          image: container.Image,
          imageId: container.ImageID,
          status: mapContainerStatus(container.State),
          state: container.Status,
          created: new Date(container.Created * 1000).toISOString(),
          ports: container.Ports.map(p => ({
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort,
            type: p.Type
          })),
          labels: container.Labels || {},
          hasUpdate,
          updateCheckError,
          isUpdating: false
        };
      })
    );
    
    // Update last check time
    settings.lastCheck = new Date().toISOString();
    saveSettings();
    
    res.json(formattedContainers);
  } catch (error) {
    console.error('Error fetching containers:', error);
    res.status(500).json({ error: 'Failed to fetch containers', details: error.message });
  }
});

// Get single container
app.get('/api/containers/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    
    res.json({
      id: info.Id,
      name: info.Name.replace(/^\//, ''),
      image: info.Config.Image,
      imageId: info.Image,
      status: mapContainerStatus(info.State.Status),
      state: info.State.Status,
      created: info.Created,
      ports: Object.entries(info.NetworkSettings.Ports || {}).map(([port, bindings]) => ({
        privatePort: parseInt(port.split('/')[0]),
        publicPort: bindings?.[0]?.HostPort ? parseInt(bindings[0].HostPort) : undefined,
        type: port.split('/')[1] || 'tcp'
      })),
      labels: info.Config.Labels || {},
      hasUpdate: false,
      isUpdating: false
    });
  } catch (error) {
    console.error('Error fetching container:', error);
    res.status(500).json({ error: 'Failed to fetch container', details: error.message });
  }
});

// Container actions
app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start container', details: error.message });
  }
});

app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop container', details: error.message });
  }
});

app.post('/api/containers/:id/restart', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true, message: 'Container restarted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restart container', details: error.message });
  }
});

// Get container logs
app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const tail = parseInt(req.query.tail) || 100;
    const since = req.query.since ? parseInt(req.query.since) : 0;
    
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail,
      since: since,
      timestamps: true
    });
    
    // Parse the logs - Docker streams have a header for each line
    const logLines = [];
    let buffer = Buffer.isBuffer(logs) ? logs : Buffer.from(logs);
    let offset = 0;
    
    while (offset < buffer.length) {
      // Each frame has 8 byte header: [stream_type(1), 0, 0, 0, size(4)]
      if (offset + 8 > buffer.length) break;
      
      const header = buffer.slice(offset, offset + 8);
      const streamType = header[0]; // 1 = stdout, 2 = stderr
      const size = header.readUInt32BE(4);
      
      if (offset + 8 + size > buffer.length) break;
      
      const line = buffer.slice(offset + 8, offset + 8 + size).toString('utf8').trim();
      if (line) {
        logLines.push({
          stream: streamType === 1 ? 'stdout' : 'stderr',
          message: line
        });
      }
      
      offset += 8 + size;
    }
    
    res.json({ logs: logLines });
  } catch (error) {
    console.error('Error fetching container logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
  }
});

// Pull image only (without recreating container)
app.post('/api/images/:imageName/pull', async (req, res) => {
  const imageName = decodeURIComponent(req.params.imageName);
  
  try {
    console.log(`📥 Pulling image: ${imageName}`);
    
    await new Promise((resolve, reject) => {
      docker.pull(imageName, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        }, (event) => {
          // Progress callback
          console.log(`   ${event.status}${event.progress ? ': ' + event.progress : ''}`);
        });
      });
    });
    
    // Clear update cache for this image
    updateCache.delete(imageName);
    
    console.log(`✅ Image pulled: ${imageName}`);
    res.json({ success: true, message: `Image ${imageName} pulled successfully` });
  } catch (error) {
    console.error('Error pulling image:', error);
    res.status(500).json({ error: 'Failed to pull image', details: error.message });
  }
});

// Get registry URL for an image
app.get('/api/images/:imageName/registry-url', (req, res) => {
  const imageName = decodeURIComponent(req.params.imageName);
  const { registry, repository, tag } = parseImageName(imageName);
  
  let registryUrl = '';
  let changelogUrl = '';
  
  if (registry === 'registry-1.docker.io') {
    // Docker Hub
    const [namespace, repo] = repository.includes('/') 
      ? repository.split('/') 
      : ['library', repository];
    
    if (namespace === 'library') {
      registryUrl = `https://hub.docker.com/_/${repo}`;
      changelogUrl = `https://hub.docker.com/_/${repo}/tags`;
    } else {
      registryUrl = `https://hub.docker.com/r/${namespace}/${repo}`;
      changelogUrl = `https://hub.docker.com/r/${namespace}/${repo}/tags`;
    }
  } else if (registry.includes('ghcr.io')) {
    // GitHub Container Registry
    registryUrl = `https://github.com/${repository}/pkgs/container/${repository.split('/').pop()}`;
    changelogUrl = registryUrl;
  } else if (registry.includes('gcr.io')) {
    // Google Container Registry
    registryUrl = `https://console.cloud.google.com/gcr/images/${repository}`;
    changelogUrl = registryUrl;
  } else {
    // Generic registry
    registryUrl = `https://${registry}`;
    changelogUrl = registryUrl;
  }
  
  res.json({
    imageName,
    registry,
    repository,
    tag,
    registryUrl,
    changelogUrl
  });
});

// Get available tags for an image
app.get('/api/images/:imageName/tags', async (req, res) => {
  const imageName = decodeURIComponent(req.params.imageName);
  const { repository, tag: currentTag } = parseImageName(imageName);
  
  try {
    const tags = await getAvailableTags(imageName);
    res.json({
      imageName,
      repository,
      currentTag,
      tags
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tags', details: error.message });
  }
});

// Get own container ID (for self-update detection)
let ownContainerId = null;
async function getOwnContainerId() {
  if (ownContainerId) return ownContainerId;
  
  try {
    // Try to read from cgroup (works in Docker)
    const { readFileSync } = await import('fs');
    const cgroup = readFileSync('/proc/self/cgroup', 'utf8');
    const match = cgroup.match(/docker[/-]([a-f0-9]{64})/);
    if (match) {
      ownContainerId = match[1];
      return ownContainerId;
    }
    
    // Try hostname method (container ID is often the hostname)
    const { hostname } = await import('os');
    const hostnameValue = hostname();
    if (hostnameValue && /^[a-f0-9]{12}$/.test(hostnameValue)) {
      // Short container ID
      const containers = await docker.listContainers({ all: true });
      for (const c of containers) {
        if (c.Id.startsWith(hostnameValue)) {
          ownContainerId = c.Id;
          return ownContainerId;
        }
      }
    }
  } catch (e) {
    // Not in a container or can't determine
  }
  return null;
}

// Update container (pull latest image and recreate)
app.post('/api/containers/:id/update', async (req, res) => {
  const containerId = req.params.id;
  const targetTag = req.body?.targetTag; // Optional: specific tag to update to
  
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const originalImageName = info.Config.Image;
    const containerName = info.Name.replace(/^\//, '');
    const oldImageId = info.Image; // This is the SHA
    
    // Parse the image name and determine target
    const { registry, repository, tag: currentTag } = parseImageName(originalImageName);
    const newTag = targetTag || currentTag;
    const targetImageName = targetTag 
      ? (registry === 'registry-1.docker.io' ? `${repository}:${newTag}` : `${registry}/${repository}:${newTag}`)
      : originalImageName;
    
    // Check if this is a self-update
    const ownId = await getOwnContainerId();
    const isSelfUpdate = ownId && (containerId === ownId || containerId.startsWith(ownId.substring(0, 12)) || ownId.startsWith(containerId));
    
    if (isSelfUpdate) {
      console.log(`⚠️ Self-update detected for ${containerName}`);
    }
    
    const logEntry = {
      id: String(logIdCounter++),
      timestamp: new Date().toISOString(),
      containerName,
      oldImage: currentTag, // Show tag/version instead of full name
      oldImageId: oldImageId.substring(0, 12), // Short SHA for reference
      newImage: newTag,
      newImageId: '',
      status: 'in-progress',
      message: isSelfUpdate ? `Updating ${containerName} (self-update)...` : `Updating ${containerName} to ${newTag}...`
    };
    updateLogs.unshift(logEntry);
    
    // Pull target image
    console.log(`Pulling image ${targetImageName}...`);
    await new Promise((resolve, reject) => {
      docker.pull(targetImageName, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });
    
    // Get container config for recreation - preserve ALL original settings
    const containerConfig = {
      // Basic config from original container
      Image: targetImageName, // Use target image (may be different tag)
      name: containerName,
      Hostname: info.Config.Hostname,
      Domainname: info.Config.Domainname,
      User: info.Config.User,
      AttachStdin: info.Config.AttachStdin,
      AttachStdout: info.Config.AttachStdout,
      AttachStderr: info.Config.AttachStderr,
      Tty: info.Config.Tty,
      OpenStdin: info.Config.OpenStdin,
      StdinOnce: info.Config.StdinOnce,
      Env: info.Config.Env,
      Cmd: info.Config.Cmd,
      Entrypoint: info.Config.Entrypoint,
      Labels: info.Config.Labels,
      WorkingDir: info.Config.WorkingDir,
      ExposedPorts: info.Config.ExposedPorts,
      StopSignal: info.Config.StopSignal,
      StopTimeout: info.Config.StopTimeout,
      Healthcheck: info.Config.Healthcheck,
      // Host config (volumes, ports, networking, resources, etc.)
      HostConfig: info.HostConfig,
      // Network config
      NetworkingConfig: {
        EndpointsConfig: info.NetworkSettings.Networks
      }
    };
    
    // Remove null/undefined values that might cause issues
    Object.keys(containerConfig).forEach(key => {
      if (containerConfig[key] === null || containerConfig[key] === undefined) {
        delete containerConfig[key];
      }
    });
    
    // Handle self-update specially
    if (isSelfUpdate) {
      console.log(`🔄 Performing self-update for ${containerName}...`);
      console.log(`   Image pulled successfully.`);
      
      // For self-update, we can't stop ourselves and restart
      // Instead, we'll use Docker's API to do a rolling update
      // by creating a new container with the same config, then stopping old one
      
      // Clear the update cache for this image
      updateCache.delete(targetImageName);
      updateCache.delete(originalImageName);
      
      // Update log entry
      logEntry.status = 'success';
      logEntry.newImage = newTag;
      logEntry.message = `Image pulled for ${containerName}. Please restart the container manually using: docker compose up -d --force-recreate dockermaid`;
      
      res.json({
        success: true,
        message: `Image pulled for ${containerName}. To complete the self-update, please run: docker compose up -d --force-recreate`,
        selfUpdate: true,
        manualRestartRequired: true,
        log: logEntry
      });
      
      return;
    }
    
    console.log(`Stopping container ${containerName}...`);
    
    // Stop and remove old container
    try {
      await container.stop();
      console.log(`Container ${containerName} stopped`);
    } catch (e) {
      console.log(`Container ${containerName} was not running or already stopped`);
    }
    await container.remove();
    console.log(`Container ${containerName} removed`);
    
    // Create and start new container
    console.log(`Creating new container ${containerName}...`);
    const newContainer = await docker.createContainer(containerConfig);
    console.log(`Starting container ${containerName}...`);
    await newContainer.start();
    
    const newInfo = await newContainer.inspect();
    console.log(`✅ Container ${containerName} updated and started successfully`);
    
    // Clear the update cache for this image
    updateCache.delete(targetImageName);
    updateCache.delete(originalImageName);
    
    const newImageId = newInfo.Image;
    const imageChanged = oldImageId !== newImageId;
    const tagChanged = currentTag !== newTag;
    
    // Update log entry
    logEntry.status = 'success';
    logEntry.newImage = newTag;
    logEntry.newImageId = newImageId.substring(0, 12);
    logEntry.message = tagChanged 
      ? `Updated ${containerName}: ${currentTag} → ${newTag}`
      : (imageChanged ? `Updated ${containerName} to latest ${newTag}` : `Recreated ${containerName} (no changes)`);
    
    res.json({
      success: true,
      message: `Container ${containerName} updated successfully`,
      imageChanged,
      tagChanged,
      log: logEntry
    });
  } catch (error) {
    console.error('Error updating container:', error);
    
    // Update log entry with failure
    const failedLog = updateLogs.find(l => l.id === String(logIdCounter - 1));
    if (failedLog) {
      failedLog.status = 'failed';
      failedLog.message = `Failed to update: ${error.message}`;
    }
    
    res.status(500).json({ error: 'Failed to update container', details: error.message });
  }
});

// Update all containers with available updates (skips self-update to prevent crash)
app.post('/api/containers/update-all', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: false }); // Only running containers
    const results = [];
    let selfUpdateSkipped = false;
    let selfUpdateContainerName = null;
    
    // Get own container ID to detect self-update
    const ownId = await getOwnContainerId();
    
    for (const containerInfo of containers) {
      const containerId = containerInfo.Id;
      const containerName = containerInfo.Names[0]?.replace(/^\//, '') || 'unknown';
      
      try {
        const container = docker.getContainer(containerId);
        const info = await container.inspect();
        const originalImageName = info.Config.Image;
        const localImageId = info.Image;
        
        // Skip containers without proper image names
        if (originalImageName.startsWith('sha256:')) {
          results.push({ containerId, containerName, status: 'skipped', message: 'No image tag' });
          continue;
        }
        
        // Check if this container has an update available
        const updateCheck = await checkImageUpdate(originalImageName, localImageId);
        if (!updateCheck.hasUpdate) {
          results.push({ containerId, containerName, status: 'skipped', message: 'No update available' });
          continue;
        }
        
        // Check if this is a self-update (DockerMaid updating itself)
        const isSelfUpdate = ownId && (containerId === ownId || containerId.startsWith(ownId.substring(0, 12)) || ownId.startsWith(containerId));
        if (isSelfUpdate) {
          selfUpdateSkipped = true;
          selfUpdateContainerName = containerName;
          console.log(`⚠️ Skipping self-update for ${containerName} in batch update to prevent crash`);
          results.push({ 
            containerId, 
            containerName, 
            status: 'skipped', 
            message: 'Self-update skipped. Please update DockerMaid manually using: docker compose up -d --force-recreate',
            selfUpdate: true
          });
          continue;
        }
        
        // Parse image name to get current tag and determine target
        const { registry, repository, tag: currentTag } = parseImageName(originalImageName);
        const isPinned = isPinnedVersionTag(currentTag);
        
        // For pinned versions, update to 'latest'; for dynamic tags, pull the same tag
        const newTag = isPinned ? 'latest' : currentTag;
        const targetImageName = registry === 'registry-1.docker.io' 
          ? `${repository}:${newTag}` 
          : `${registry}/${repository}:${newTag}`;
        
        console.log(`📦 Updating ${containerName}: ${currentTag} → ${newTag}`);
        
        const logEntry = {
          id: String(logIdCounter++),
          timestamp: new Date().toISOString(),
          containerName,
          oldImage: currentTag,
          oldImageId: localImageId.substring(7, 19), // Short SHA
          newImage: newTag,
          newImageId: '',
          status: 'in-progress',
          message: `Updating ${containerName} from ${currentTag} to ${newTag}...`
        };
        updateLogs.unshift(logEntry);
        
        // Pull target image
        await new Promise((resolve, reject) => {
          docker.pull(targetImageName, (err, stream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err, output) => {
              if (err) return reject(err);
              resolve(output);
            });
          });
        });
        
        // Get container config - preserve all original settings
        const containerConfig = {
          Image: targetImageName,
          name: containerName,
          Hostname: info.Config.Hostname,
          Domainname: info.Config.Domainname,
          User: info.Config.User,
          AttachStdin: info.Config.AttachStdin,
          AttachStdout: info.Config.AttachStdout,
          AttachStderr: info.Config.AttachStderr,
          Tty: info.Config.Tty,
          OpenStdin: info.Config.OpenStdin,
          StdinOnce: info.Config.StdinOnce,
          Env: info.Config.Env,
          Cmd: info.Config.Cmd,
          Entrypoint: info.Config.Entrypoint,
          Labels: info.Config.Labels,
          WorkingDir: info.Config.WorkingDir,
          ExposedPorts: info.Config.ExposedPorts,
          StopSignal: info.Config.StopSignal,
          StopTimeout: info.Config.StopTimeout,
          Healthcheck: info.Config.Healthcheck,
          HostConfig: info.HostConfig,
          NetworkingConfig: {
            EndpointsConfig: info.NetworkSettings.Networks
          }
        };
        
        // Remove null/undefined values
        Object.keys(containerConfig).forEach(key => {
          if (containerConfig[key] === null || containerConfig[key] === undefined) {
            delete containerConfig[key];
          }
        });
        
        // Stop and remove old container
        try { await container.stop(); } catch (e) { /* ignore */ }
        await container.remove();
        
        // Create and start new container
        const newContainer = await docker.createContainer(containerConfig);
        await newContainer.start();
        
        const newInfo = await newContainer.inspect();
        const newImageId = newInfo.Image;
        
        // Update log entry with success
        logEntry.status = 'success';
        logEntry.newImage = newTag;
        logEntry.newImageId = newImageId.substring(7, 19);
        logEntry.message = `Updated ${containerName}: ${currentTag} → ${newTag}`;
        
        // Clear update cache for both old and new image names
        updateCache.delete(originalImageName);
        updateCache.delete(targetImageName);
        
        console.log(`✅ ${containerName} updated: ${currentTag} → ${newTag}`);
        results.push({ containerId, containerName, status: 'success', oldTag: currentTag, newTag });
      } catch (error) {
        const failedLog = updateLogs.find(l => l.containerName === containerName && l.status === 'in-progress');
        if (failedLog) {
          failedLog.status = 'failed';
          failedLog.message = `Failed: ${error.message}`;
        }
        results.push({ containerId, containerName, status: 'failed', error: error.message });
      }
    }
    
    res.json({ 
      success: true, 
      results,
      selfUpdateSkipped,
      selfUpdateContainerName,
      message: selfUpdateSkipped 
        ? `Updates applied. DockerMaid (${selfUpdateContainerName}) was skipped to prevent crash. Update it manually.`
        : 'All updates applied successfully.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update containers', details: error.message });
  }
});

// Get Super-Visor status
app.get('/api/supervisor/status', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const runningContainers = containers.filter(c => c.State === 'running');
    
    // Count containers with updates available from cache
    let updatesAvailable = 0;
    for (const [, cached] of updateCache) {
      if (cached.hasUpdate) updatesAvailable++;
    }
    
    res.json({
      isRunning: true,
      version: APP_VERSION,
      lastCheck: settings.lastCheck || new Date().toISOString(),
      totalContainers: containers.length,
      runningContainers: runningContainers.length,
      stoppedContainers: containers.length - runningContainers.length,
      updatesAvailable,
      settings: {
        checkInterval: settings.checkInterval,
        autoUpdate: settings.autoUpdate
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status', details: error.message });
  }
});

// Get settings
app.get('/api/settings', (req, res) => {
  res.json(settings);
});

// Update settings
app.put('/api/settings', (req, res) => {
  const { checkInterval, autoUpdate } = req.body;
  
  if (typeof checkInterval === 'number' && checkInterval >= 0) {
    settings.checkInterval = checkInterval;
  }
  if (typeof autoUpdate === 'boolean') {
    settings.autoUpdate = autoUpdate;
  }
  
  saveSettings();
  
  // Restart periodic check timer if needed
  setupPeriodicCheck();
  
  res.json(settings);
});

// Clear update cache (force re-check)
app.post('/api/cache/clear', (req, res) => {
  updateCache.clear();
  res.json({ success: true, message: 'Update cache cleared' });
});

// Get update logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(updateLogs.slice(0, limit));
});

// Clear logs
app.delete('/api/logs', (req, res) => {
  updateLogs.length = 0;
  res.json({ success: true, message: 'Logs cleared' });
});

// Get Docker info
app.get('/api/docker/info', async (req, res) => {
  try {
    const info = await docker.info();
    res.json({
      dockerVersion: info.ServerVersion,
      os: info.OperatingSystem,
      architecture: info.Architecture,
      cpus: info.NCPU,
      memory: info.MemTotal,
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Docker info', details: error.message });
  }
});

// Get images
app.get('/api/images', async (req, res) => {
  try {
    const images = await docker.listImages();
    res.json(images.map(img => ({
      id: img.Id,
      repoTags: img.RepoTags || [],
      size: img.Size,
      created: new Date(img.Created * 1000).toISOString()
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get images', details: error.message });
  }
});

// Helper function to map container status
function mapContainerStatus(state) {
  const statusMap = {
    'running': 'running',
    'exited': 'exited',
    'paused': 'paused',
    'restarting': 'restarting',
    'dead': 'stopped',
    'created': 'stopped',
    'removing': 'stopped'
  };
  return statusMap[state.toLowerCase()] || 'stopped';
}

// Periodic update check
let periodicCheckInterval = null;

async function performPeriodicCheck() {
  if (!dockerConnected) return;
  
  console.log('🔄 Running periodic update check...');
  try {
    const containers = await docker.listContainers({ all: false }); // Only running containers
    
    for (const container of containers) {
      if (!container.Image.startsWith('sha256:')) {
        await checkImageUpdate(container.Image, container.ImageID);
      }
    }
    
    settings.lastCheck = new Date().toISOString();
    saveSettings();
    
    // Count updates available
    let updatesAvailable = 0;
    for (const [, cached] of updateCache) {
      if (cached.hasUpdate) updatesAvailable++;
    }
    
    console.log(`✅ Periodic check complete. ${updatesAvailable} updates available.`);
  } catch (error) {
    console.error('❌ Periodic check failed:', error.message);
  }
}

function setupPeriodicCheck() {
  // Clear existing interval
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
  }
  
  // Set up new interval if configured
  if (settings.checkInterval > 0) {
    const intervalMs = settings.checkInterval * 60 * 1000; // Convert minutes to ms
    periodicCheckInterval = setInterval(performPeriodicCheck, intervalMs);
    console.log(`📅 Periodic check scheduled every ${settings.checkInterval} minutes`);
  }
}

// Serve static files in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(distPath, 'index.html'));
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🐳 DockerMaid Server v${APP_VERSION}                              ║
║                                                               ║
║   Server running on http://localhost:${String(PORT).padEnd(24)}║
║   API endpoint: http://localhost:${String(PORT).padEnd(24)}/api║
║                                                               ║
║   Docker socket: ${dockerSocket.padEnd(40)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  // Set up periodic check on startup
  setupPeriodicCheck();
  
  // Run initial check after 10 seconds
  setTimeout(() => {
    if (settings.checkInterval > 0) {
      performPeriodicCheck();
    }
  }, 10000);
});
