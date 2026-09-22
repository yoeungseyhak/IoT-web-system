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

export const toggleUserControl = (id, canControl) => apiRequest(`/users/${id}/control`, { method: 'PUT', body: JSON.stringify({ can_control: canControl }) });

export const getReports = () => apiRequest('/reports');
export const createReport = (data) => apiRequest('/reports', { method: 'POST', body: JSON.stringify(data) });
export const updateReportStatus = (id, status) => apiRequest(`/reports/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
export const deleteReport = (id) => apiRequest(`/reports/${id}`, { method: 'DELETE' });

// Emergency API
export const getEmergencyStatus = () => apiRequest('/emergency/status');
export const triggerEvacuation = () => apiRequest('/emergency/evacuate', { method: 'POST' });
export const triggerLockdown = () => apiRequest('/emergency/lockdown', { method: 'POST' });
export const clearEmergency = () => apiRequest('/emergency/clear', { method: 'POST' });

// Parking API
export const getParkingSlots = () => apiRequest('/parking/slots');
export const createParkingSlot = (data) => apiRequest('/parking/slots', { method: 'POST', body: JSON.stringify(data) });
export const deleteParkingSlot = (id) => apiRequest(`/parking/slots/${id}`, { method: 'DELETE' });
export const updateSlotStatus = (id, occupied) => apiRequest(`/parking/slots/${id}/status`, { method: 'PUT', body: JSON.stringify({ occupied }) });
