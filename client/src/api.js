const API_BASE = '/api';

async function apiRequest(endpoint, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const tokenFromStorage = localStorage.getItem('token');
  if (!token && tokenFromStorage) {
    headers['Authorization'] = `Bearer ${tokenFromStorage}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'API request failed');
  }
  return data;
}

export const login = (username, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
export const getMe = (token) => apiRequest('/auth/me', {}, token);
export const changePassword = (currentPassword, newPassword) => apiRequest('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });

export const getUsers = () => apiRequest('/users');
export const createUser = (data) => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) });
export const deleteUser = (id) => apiRequest(`/users/${id}`, { method: 'DELETE' });
export const changeUserPassword = (id, newPassword) => apiRequest(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });

export const getDevices = () => apiRequest('/devices');
export const updateDevice = (id, state) => apiRequest(`/devices/${id}`, { method: 'PUT', body: JSON.stringify({ state }) });

export const getLogs = () => apiRequest('/logs');

export const getDeviceAutomation = (id) => apiRequest(`/devices/${id}/automation`);
export const setDeviceSchedule = (id, data) => apiRequest(`/devices/${id}/schedule`, { method: 'POST', body: JSON.stringify(data) });
export const setDeviceCountdown = (id, data) => apiRequest(`/devices/${id}/countdown`, { method: 'POST', body: JSON.stringify(data) });
export const setDeviceCycleCount = (id, data) => apiRequest(`/devices/${id}/cycle-count`, { method: 'POST', body: JSON.stringify(data) });
export const cancelDeviceAutomation = (id, type) => apiRequest(`/devices/${id}/automation/${type}`, { method: 'DELETE' });

export const createDevice = (data) => apiRequest('/devices', { method: 'POST', body: JSON.stringify(data) });
export const updateDeviceDetails = (id, data) => apiRequest(`/devices/${id}/details`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDevice = (id) => apiRequest(`/devices/${id}`, { method: 'DELETE' });
