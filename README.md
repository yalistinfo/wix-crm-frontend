# CRM Frontend — Sales Dashboard

This is the actual website your team will use — the same app you tested as
a Claude artifact, now saving to your deployed backend instead of browser
storage, so everyone sees the same data from any device.

## Local test

1. Make sure `wix-crm-backend` is running first (`npm start` in that folder)
2. `npm install`
3. Copy `.env.example` to `.env` — point `VITE_API_URL` at your backend
   (`http://localhost:3000` for local testing)
4. `npm run dev` — opens at `http://localhost:5173`

You should see the exact same Contacts / Sales Dashboard app, but now every
change is saved through the backend's `/api/data` endpoint instead of
Claude's artifact storage.

## Deploying for real

1. Deploy `wix-crm-backend` first (Render/Railway) and note its public URL
2. Deploy this folder as a static site:
   - **Vercel** or **Netlify**: connect the repo/folder, build command
     `npm run build`, output directory `dist`
   - Set the environment variable `VITE_API_URL` in that host's dashboard to
     your backend's public URL (e.g. `https://your-backend.onrender.com`)
3. Once deployed, you'll get a URL like `your-crm.vercel.app` — that's what
   you and your team bookmark and log into

## Notes

- There's no login/auth yet — right now, anyone with the URL can open and
  edit the data. Worth adding a simple password gate before sharing the
  link widely; say the word and I'll add one.
- The backend's CORS is currently open to any origin. Once you know your
  frontend's final URL, it's worth locking that down in `server.js`.
