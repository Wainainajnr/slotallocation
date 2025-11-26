// File: services/api.js
const DEFAULT_REMOTE = process.env.REACT_APP_API_BASE || '';

class DrivingSchoolAPI {
  constructor(remoteBase = DEFAULT_REMOTE) {
    let base = (remoteBase || '').trim();
    if (base && !/^https?:\/\//i.test(base)) {
      if (/^:\d+$/.test(base)) base = `http://localhost${base}`;
      else if (/^[\w.-]+:\d+$/.test(base)) base = `http://${base}`;
      else base = `http://${base}`;
    }
    this.remoteBase = base;
  }

  // Clear cookies and storage (for HTTP 431)
  clearAuthData() {
    try {
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      });
      localStorage.clear();
      sessionStorage.clear();
      console.log('[API] Cleared auth data due to HTTP 431');
    } catch (e) {
      console.warn('[API] Failed to clear auth data:', e);
    }
  }

  async request(path, { method = 'GET', body = null } = {}) {
    const url = this.remoteBase ? `${this.remoteBase.replace(/\/$/, '')}${path}` : path;
    const opts = {
      method,
      headers: {
        'Accept': 'application/json',
        ...(body && { 'Content-Type': 'application/json' }),
      },
      credentials: 'omit',
      cache: 'no-cache',
      ...(body && { body: JSON.stringify(body) }),
    };

    let res;
    try {
      res = await fetch(url, opts);
    } catch (networkErr) {
      if (this.remoteBase) {
        try {
          res = await fetch(path, opts); // fallback relative path
        } catch (err2) {
          throw Object.assign(new Error(`Network error: ${err2.message}`), { status: 0, isNetworkError: true });
        }
      } else {
        throw Object.assign(new Error(`Network error: ${networkErr.message}`), { status: 0, isNetworkError: true });
      }
    }

    if (res.status === 431) {
      this.clearAuthData();
      throw Object.assign(new Error('HTTP 431 - Request Header Fields Too Large'), { status: 431, isHeaderTooLarge: true });
    }

    if (!res.ok) {
      let errBody = null;
      try { errBody = JSON.parse(await res.text()); } 
      catch { errBody = { message: await res.text() }; }
      const err = new Error(errBody?.message || `HTTP ${res.status} - ${res.statusText}`);
      err.status = res.status;
      err.body = errBody;
      throw err;
    }

    try { return await res.json(); } 
    catch { throw Object.assign(new Error('Failed to parse JSON response'), { status: res.status || 0 }); }
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
        students: Array.isArray(s.students) ? s.students : [],
        suspended: !!s.suspended, // suspended status persists from backend
      }));
    } catch (err) {
      console.error('[API] getSlots error:', err);
      throw err;
    }
  }

  async bookSlot(slotId, studentName, date = null) {
    const d = date || new Date().toISOString().split('T')[0];
    return this.request('/admin/book', {
      method: 'POST',
      body: { date: d, hour: String(slotId).padStart(2,'0'), student_name: studentName }
    });
  }

  async deleteBooking(slotId, studentName, date = null) {
    const d = date || new Date().toISOString().split('T')[0];
    return this.request('/admin/book', {
      method: 'DELETE',
      body: { date: d, hour: String(slotId).padStart(2,'0'), student_name: studentName }
    });
  }

  // Persist suspension in backend so it survives reloads
  async suspendSlot(slotId, action, date = null) {
    const d = date || new Date().toISOString().split('T')[0];

    // Validate action
    if (!['suspend','unsuspend'].includes(action)) {
      throw new Error(`Invalid suspend action: ${action}`);
    }

    // Send to backend
    return this.request('/admin/suspend', {
      method: 'POST',
      body: {
        date: d,
        slotId: String(slotId).padStart(2,'0'),
        action
      }
    });
  }
}

export const api = new DrivingSchoolAPI(DEFAULT_REMOTE);
