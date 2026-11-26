(() => {
  'use strict';

  async function request(url, options = {}) {
    const config = {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    };
    if (config.body && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body);
    }

    let res;
    try {
      res = await fetch(url, config);
    } catch (_) {
      throw new Error('Could not reach the server. Check your internet connection and try again.');
    }

    let data = {};
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.FinPlayAPI = {
    get: url => request(url, { method: 'GET' }),
    post: (url, body) => request(url, { method: 'POST', body }),
    patch: (url, body) => request(url, { method: 'PATCH', body }),
    del: url => request(url, { method: 'DELETE' })
  };
})();
