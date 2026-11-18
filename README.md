# Kofeely Coffee Discount Wheel

Scan the QR code, enter the PIN, spin once, win a random offer. All 10 offers are revealed only after the spin finishes.

## Pages
- `/` - customer page (PIN, wheel, result and all offers). It has an "Admin login" link at the bottom.
- `/admin.html` - admin page: change the spin PIN, edit the 10 offers and how often each should come up per 100 spins (total must be 100), change the admin password, view recent spins, reset spins.

## Starting credentials
- Spin PIN: `7236`
- Admin password: `11OctKofeelyCoffee` (case-sensitive)

Change the admin password from the admin page after your first login.

## Run locally
```bash
npm install
npm start        # http://localhost:3000
```

## Put it on GitHub
Create an empty repo on github.com, then either drag-and-drop the files with "uploading an existing file", or:
```bash
git init && git add . && git commit -m "Kofeely discount wheel"
git branch -M main
git remote add origin https://github.com/<username>/kofeely-discount-wheel.git
git push -u origin main
```

## Deploy (Render / Railway)
GitHub Pages cannot run this app because it needs a server. On Render: New Web Service, pick the repo, Build `npm install`, Start `npm start`.

**Important:** the PIN, offers, password and spin records live in `data.json`. On free hosting that file is wiped when the service restarts or redeploys, which resets everything to the starting credentials above. Add a persistent disk and set the `DATA_DIR` environment variable to its path to keep your data.

## Admin login not working?
- Open `/admin.html` on your deployed URL (not the GitHub page).
- The password is case-sensitive; copy it exactly.
- After 10 wrong attempts from one network, logins are blocked for 15 minutes.
- If you changed the password and the data was wiped by a restart, use the starting password again.

## QR code
Put your deployed URL into any free QR generator and print the result.

## Limits
- "One spin per customer" is tracked with a browser cookie. Someone who clears cookies or uses another phone can spin again, so the result screen shows a code - ask customers to show it at the cart.
- Tell the PIN at the cart only; do not print it on the QR poster.
