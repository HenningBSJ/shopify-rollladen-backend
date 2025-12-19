window.AuthManager = {
  apiUrl: 'https://rollladen-backend-ho4o.vercel.app',
  
  getAuthToken() {
    return localStorage.getItem('auth_token');
  },

  getRefreshToken() {
    return localStorage.getItem('refresh_token');
  },

  getCurrentUser() {
    const user = localStorage.getItem('current_user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated() {
    return !!this.getAuthToken();
  },

  async register(formData) {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      this.setAuthTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('current_user', JSON.stringify(data.user));
      
      console.log('[Auth] Registration successful');
      return data.user;
    } catch (err) {
      console.error('[Auth] Registration error:', err.message);
      throw err;
    }
  },

  async login(email, password) {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      this.setAuthTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('current_user', JSON.stringify(data.user));
      
      console.log('[Auth] Login successful');
      return data.user;
    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      throw err;
    }
  },

  async refreshAccessToken() {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const response = await fetch(`${this.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        this.logout();
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      localStorage.setItem('auth_token', data.accessToken);
      
      console.log('[Auth] Token refreshed');
      return data.accessToken;
    } catch (err) {
      console.error('[Auth] Token refresh error:', err.message);
      this.logout();
      throw err;
    }
  },

  setAuthTokens(accessToken, refreshToken) {
    localStorage.setItem('auth_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  },

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
    console.log('[Auth] Logged out');
  },

  async apiCall(method, endpoint, body = null) {
    let token = this.getAuthToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    let response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (response.status === 401) {
      token = await this.refreshAccessToken();
      response = await fetch(`${this.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : null,
      });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API call failed');
    }

    return response.json();
  },

  async getAddresses() {
    return this.apiCall('GET', '/api/addresses');
  },

  async addAddress(addressData) {
    return this.apiCall('POST', '/api/addresses', addressData);
  },

  async updateAddress(id, addressData) {
    return this.apiCall('PUT', `/api/addresses/${id}`, addressData);
  },

  async deleteAddress(id) {
    return this.apiCall('DELETE', `/api/addresses/${id}`);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (!window.AuthManager.isAuthenticated()) {
    console.log('[Auth] User not authenticated');
  } else {
    console.log('[Auth] User authenticated as:', window.AuthManager.getCurrentUser().email);
  }
});
