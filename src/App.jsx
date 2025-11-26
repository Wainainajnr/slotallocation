import React, { useState } from 'react';
import StudentBooking from './components/StudentBooking.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('student');
  const [adminAuth, setAdminAuth] = useState(sessionStorage.getItem('adminAuth') === 'true');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');

  const handleAdminSubmit = () => {
    // Get password from environment variable
    const PASS = process.env.REACT_APP_ADMIN_PASSWORD || 'Admin@123';
    if (adminPassword === PASS) {
      setAdminAuth(true);
      sessionStorage.setItem('adminAuth', 'true');
      setAdminPassword('');
      setAdminError('');
      setActiveTab('admin');
    } else {
      setAdminError('Incorrect password');
    }
  };

  const handleLogout = () => {
    setAdminAuth(false);
    sessionStorage.removeItem('adminAuth');
    setActiveTab('student');
  };

  return (
    <div className="container">
      {/* Modern Hero Section */}
      <header className="app-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="30" height="30" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="30" cy="30" r="28" stroke="white" strokeWidth="3" opacity="0.3" />
              <path d="M30 10 L30 50 M10 30 L50 30" stroke="white" strokeWidth="3" strokeLinecap="round" />
              <circle cx="30" cy="30" r="8" fill="white" />
            </svg>
          </div>
          <h1 className="hero-title">AA Ngong Driving School</h1>
          <p className="hero-subtitle">Book Your Driving Sessions Online</p>
          <div className="hero-features">
            <span className="feature-badge">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L10.5 5.5L16 6.5L12 10.5L13 16L8 13L3 16L4 10.5L0 6.5L5.5 5.5L8 0Z" />
              </svg>
              Easy Booking
            </span>
            <span className="feature-badge">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm.5-8H7v4.2l3.6 2.1.7-1.2-2.8-1.7V5z" />
              </svg>
              Real-time Availability
            </span>
            <span className="feature-badge">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1L2 4v5c0 3.9 2.7 7.5 6 8.5 3.3-1 6-4.6 6-8.5V4L8 1zm0 2.2l4 2.2v4.1c0 2.8-1.9 5.4-4 6.3-2.1-.9-4-3.5-4-6.3V5.4l4-2.2z" />
              </svg>
              Secure & Reliable
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex justify-center items-center gap-4 my-4">
        {['student', 'admin'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {tab === 'student' ? 'Student Booking' : 'Admin View'}
          </button>
        ))}

        {/* Logout Button - Only show when admin is authenticated */}
        {adminAuth && (
          <button
            onClick={handleLogout}
            className="btn bg-red-500 text-white hover:bg-red-600 ml-2"
            title="Logout from Admin"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="inline mr-1">
              <path d="M3 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H3zm7.5 10.5l-3 3a.5.5 0 0 1-.708-.708L9.293 10.5H4.5a.5.5 0 0 1 0-1h4.793l-2.5-2.293a.5.5 0 1 1 .707-.707l3 3a.5.5 0 0 1 0 .707z" />
            </svg>
            Logout
          </button>
        )}
      </nav>

      <div className="main-content">
        {activeTab === 'student' ? (
          <>
            {/* Left Column: Booking Form */}
            <StudentBooking />

            {/* Right Column: Info Sections */}
            <div className="p-8 bg-gray-50 flex flex-col gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-lg mb-3 text-indigo-900">Session Hours</h4>
                <ul className="space-y-2 text-gray-600">
                  <li>Practical: 7:00 AM - 5:00 PM</li>
                  <li>Theory: 12:00 PM - 1:00 PM</li>
                  <li>Max 4 students per hour</li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-lg mb-3 text-indigo-900">How to Book</h4>
                <ol className="list-decimal list-inside space-y-2 text-gray-600">
                  <li>Enter your full name</li>
                  <li>Select an available slot</li>
                  <li>Click "Book Selected Slot"</li>
                </ol>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-lg mb-3 text-indigo-900">Need Help?</h4>
                <p className="text-gray-600">Contact us at:</p>
                <p className="font-semibold text-indigo-600 mt-1">📞 0759963210</p>
                <p className="font-semibold text-indigo-600">✉️ aangongtown@aakenya.co.ke</p>
              </div>
            </div>
          </>
        ) : (
          /* Admin View - Full Width (col-span-2) */
          <div className="col-span-2 p-8">
            {adminAuth ? (
              <AdminPanel />
            ) : (
              <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Admin Access</h2>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setAdminError(''); }}
                    placeholder="Enter admin password"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdminSubmit(); }}
                  />
                </div>
                {adminError && <div className="text-red-600 mb-4 text-sm bg-red-50 p-2 rounded">{adminError}</div>}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAdminSubmit()}
                    className="btn btn-primary w-full"
                  >
                    Unlock Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center pb-4">
        <p className="text-white text-sm">
          Made by{' '}
          <a
            href="https://ericwainaina.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline text-white"
          >
            Nexric Innovation
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;