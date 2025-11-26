// services/api.js
const DEFAULT_REMOTE = process.env.REACT_APP_API_BASE || '';

class DrivingSchoolAPI {
  constructor(remoteBase = DEFAULT_REMOTE) {
    // Normalize provided base URL. Accept forms like ":3001" or "localhost:3001"
    let base = (remoteBase || '').trim();
    if (base && !/^https?:\/\//i.test(base)) {
      // If it starts with a colon (":3001") or is host:port, prefix with http://localhost
      if (/^:\d+$/.test(base) || /^[\w.-]+:\d+$/.test(base)) {
        if (base.startsWith(':')) base = `http://localhost${base}`;
        else base = `http://${base}`;
      } else if (base === '' || base === '/') {
        base = '';
      } else {
        // If it's something else without protocol, assume http
        base = `http://${base}`;
      }
    }
    this.remoteBase = base;
    this.shouldRetry = true;
  }

  // Clear all authentication data
  clearAuthData() {
    try {
      // Clear all cookies for current domain
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      });
      
      localStorage.clear();
      sessionStorage.clear();
      console.log('[API] Auth data cleared due to 431 error');
    } catch (e) {
      console.warn('[API] Could not clear all auth data:', e);
    }
  }

  async request(path, { method = 'GET', body = null } = {}) {
    const base = this.remoteBase || '';
    const url = base ? `${base.replace(/\/$/, '')}${path}` : path;
    // Debug log the final URL used for fetch
    // eslint-disable-next-line no-console
    console.debug(`[API] request -> ${method} ${url} (base=${this.remoteBase})`);
    
    const opts = {
      method,
      headers: {
        'Accept': 'application/json',
        ...(body && { 'Content-Type': 'application/json' })
      },
      // Force no credentials to prevent cookie sending
      credentials: 'omit',
      // Add cache control to prevent cached responses with old headers
      cache: 'no-cache'
    };

    if (body) {
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (networkErr) {
      // First network attempt failed. If we have a remoteBase configured, retry using a relative path
      // This helps in dev where CRA proxy is used instead of a direct host:port value.
      if (this.remoteBase) {
        try {
          console.warn(`[API] primary fetch failed (${networkErr.message}), retrying with relative path ${path}`);
          res = await fetch(path, opts);
        } catch (networkErr2) {
          const err = new Error(`Network error: ${networkErr2.message}`);
          err.status = 0;
          err.isNetworkError = true;
          throw err;
        }
      } else {
        const err = new Error(`Network error: ${networkErr.message}`);
        err.status = 0;
        err.isNetworkError = true;
        throw err;
      }
    }

    // Handle 431 specifically
    if (res.status === 431) {
      this.clearAuthData();
      
      const err = new Error('HTTP 431 - Request Header Fields Too Large');
      err.status = 431;
      err.isHeaderTooLarge = true;
      throw err;
    }

    if (!res.ok) {
      let errBody = null;
      try { 
        const text = await res.text();
        try {
          errBody = JSON.parse(text);
        } catch {
          errBody = { message: text };
        }
      } catch (e) {
        // Ignore
      }
      
      const err = new Error(
        errBody?.message || `HTTP ${res.status} - ${res.statusText}`
      );
      err.status = res.status;
      err.body = errBody;
      throw err;
    }

    try {
      return await res.json();
    } catch (e) {
      const err = new Error('Failed to parse JSON response');
      err.status = res.status || 0;
      throw err;
    }
  }

  async getSlots(date = null) {
    const d = date || new Date().toISOString().split('T')[0];
    
    try {
      const data = await this.request(`/admin/daily?date=${encodeURIComponent(d)}`);
      
      const slotsArray = Array.isArray(data) ? data : (data.slots || []);
      return slotsArray.map(s => ({
        id: s.hour?.toString() ?? `${s.id}`,
        hour: s.hour,
        capacity: s.capacity || 4,
        students: Array.isArray(s.students) ? s.students : []
      }));
    } catch (error) {
      console.error('[API] getSlots error:', error);
      throw error;
    }
  }

  async bookSlot(slotId, studentName, date = null) {
    const d = date || new Date().toISOString().split('T')[0];
    const hour = String(slotId).padStart(2, '0');
    
    try {
      return await this.request('/admin/book', {
        method: 'POST',
        body: { 
          date: d, 
          hour, 
          student_name: studentName 
        }
      });
    } catch (error) {
      console.error('[API] bookSlot error:', error);
      throw error;
    }
  }

  async deleteBooking(slotId, studentName, date = null) {
    const d = date || new Date().toISOString().split('T')[0];
    const hour = String(slotId).padStart(2, '0');
    try {
      return await this.request('/admin/book', {
        method: 'DELETE',
        body: {
          date: d,
          hour,
          student_name: studentName
        }
      });
    } catch (err) {
      console.error('[API] deleteBooking error:', err);
      throw err;
    }
  }
}

export const api = new DrivingSchoolAPI(DEFAULT_REMOTE);