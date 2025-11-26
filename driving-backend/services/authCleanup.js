// services/authCleanup.js
export const checkAndCleanAuth = () => {
  // Check if we're having header size issues
  const hasLargeCookies = document.cookie.length > 2000; // arbitrary threshold
  
  if (hasLargeCookies) {
    console.warn('Large cookies detected, cleaning auth data...');
    clearAllAuthData();
    window.location.reload();
  }
};

export const clearAllAuthData = () => {
  // Clear all possible storage locations
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear all cookies for the current domain
  document.cookie.split(';').forEach(cookie => {
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
  });
};