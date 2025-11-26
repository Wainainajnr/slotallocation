# DriveMaster Booking Portal

This is a simple React app (mock) for a driving school booking portal where students can self-book driving sessions.

## Project Structure

- `public/index.html` - root HTML file
- `src/index.js` - React entry
- `src/index.css` - styles
- `src/App.js` - main app wiring
- `src/components/StudentBooking.js` - student booking UI
- `src/components/AvailabilityGrid.js` - slot grid
- `src/components/AdminPanel.js` - admin view
- `src/services/api.js` - mock API service

## Run locally

1. Install dependencies

```powershell
cd driving-school-booking
npm install
```

2. Start dev server

```powershell
npm start
```

The app will open at `http://localhost:3000`.

## Notes
- This uses a mock in-memory `api` service at `src/services/api.js`. Replace with a real backend or Google Sheets API as needed.
- Maximum 4 students per hour is enforced in the mock.
- 12:00 PM-1:00 PM is reserved for theory and cannot be booked.

If you want, I can run `npm install` and `npm start` here (requires Node installed on your machine).