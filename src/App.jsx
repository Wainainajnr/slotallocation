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
    const PASS = 'Admin@123';
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

    return (
      <div className="relative min-h-screen">
        {/* fullscreen translucent overlay to darken background image for legibility */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        <header className="relative overflow-hidden rounded-b-xl mx-4 md:mx-auto py-8 flex items-center justify-center">
          <div className="relative z-10 w-full max-w-4xl px-4">
            <svg width="100%" viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(50, 25)">
                <path d="M75 0C33.6 0 0 33.6 0 75C0 116.4 33.6 150 75 150C116.4 150 150 116.4 150 75" stroke="#0A2342" strokeWidth="12" strokeLinecap="round" />
                <path d="M150 75C150 33.6 116.4 0 75 0" stroke="#00C9A7" strokeWidth="12" strokeLinecap="round" />
                <path d="M20 75H130" stroke="#0A2342" strokeWidth="12" strokeLinecap="round" />
                <path d="M75 75V130" stroke="#0A2342" strokeWidth="12" strokeLinecap="round" />
                <path d="M75 15L55 45H95L75 15Z" fill="#00C9A7" />
              </g>

              <text x="220" y="70" fill="#0A2342" fontFamily="Montserrat, sans-serif" fontWeight="bold" fontSize="42">AA Ngong</text>
              <text x="220" y="110" fill="#0A2342" fontFamily="Montserrat, sans-serif" fontWeight="600" fontSize="32">Slot Booking Portal</text>
              <text x="220" y="145" fill="#6B7C93" fontFamily="Open Sans, sans-serif" fontSize="18">Book your practical driving sessions easily</text>
            </svg>
          </div>
        </header>

        <nav className="bg-white border-b border-gray-200 flex justify-center gap-6 p-4">
          {['student', 'admin'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-semibold text-lg border-b-4 ${
                activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'
              }`}
            >
              {tab === 'student' ? '🎯 Student Booking' : '⚙️ Admin View'}
            </button>
          ))}
        </nav>

        <main className="container mx-auto p-6 relative z-10">
          {activeTab === 'student' ? (
            <StudentBooking />
          ) : (
            adminAuth ? (
              <AdminPanel />
            ) : (
              <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
                <h2 className="text-xl font-semibold mb-4">Admin Access</h2>
                <p className="mb-3 text-sm text-gray-600">Enter the admin password to continue.</p>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => { setAdminPassword(e.target.value); setAdminError(''); }}
                  placeholder="Password"
                  className="w-full border rounded p-2 mb-3"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdminSubmit(); }}
                />
                {adminError && <div className="text-red-600 mb-3">{adminError}</div>}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAdminSubmit()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded"
                  >
                    Unlock Admin
                  </button>
                  <button
                    onClick={() => { setActiveTab('student'); setAdminPassword(''); setAdminError(''); }}
                    className="px-4 py-2 rounded border"
                  >
                    Back
                  </button>
                </div>
              </div>
            )
          )}
        
          <section className="mt-10 grid md:grid-cols-3 gap-6">
            <div className="bg-white p-4 rounded shadow">
              <h4 className="font-semibold mb-2">Session Hours</h4>
              <p>Practical sessions: 7:00 AM - 5:00 PM</p>
              <p>Theory time: 12:00 PM - 1:00 PM</p>
              <p>Maximum 4 students per hour</p>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <h4 className="font-semibold mb-2">How to Book</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Enter your full name</li>
                <li>Click on an available time slot</li>
                <li>Book your slot</li>
              </ol>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <h4 className="font-semibold mb-2">Need Help?</h4>
              <p>Contact us at:</p>
              <p>📞 0759963210</p>
              <p>✉️ aangongtown@aakenya.co.ke</p>
            </div>
          </section>
        </main>
      </div>
    );
}

export default App;