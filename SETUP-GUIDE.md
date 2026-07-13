# Laundry Pickup Scheduler — Setup Guide

This app automates your weekly laundry pickup workflow. Customers click a button in your email to confirm their pickup day, and the app builds your driver's route, generates the pickup list PDF, and gives you a ready-to-paste email list for follow-ups.

**Cost: $0/month** — runs on Vercel free tier + Google Sheets API (free)

---

## Step 1: Set Up Google Cloud (5 minutes)

You need a "service account" so the app can read/write your Google Sheet.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a **new project** (name it "Laundry Pickup" or anything)
3. In the left sidebar, go to **APIs & Services → Library**
4. Search for **"Google Sheets API"** and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **+ Create Credentials → Service Account**
   - Name: `laundry-pickup`
   - Click **Create and Continue**
   - Skip the role/access steps, just click **Done**
7. Click on the service account you just created
8. Go to the **Keys** tab
9. Click **Add Key → Create new key → JSON**
10. A JSON file will download — **keep this safe!**

From that JSON file, you'll need two values:
- `client_email` (looks like `laundry-pickup@your-project.iam.gserviceaccount.com`)
- `private_key` (starts with `-----BEGIN PRIVATE KEY-----`)

---

## Step 2: Share Your Google Sheet (1 minute)

1. Open your Google Sheet ("Laundry Service")
2. Click **Share** (top right)
3. Paste the `client_email` from Step 1
4. Give it **Editor** access
5. Click **Send**

Also grab your **Sheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/THIS_PART_IS_YOUR_SHEET_ID/edit
```

---

## Step 3: Deploy to Vercel (5 minutes)

### Option A: Deploy via GitHub (Recommended)

1. Create a new GitHub repo (private is fine)
2. Push this entire `laundry-pickup-app` folder to the repo
3. Go to [vercel.com](https://vercel.com) and sign in with your new account
4. Click **Add New → Project**
5. Import your GitHub repo
6. Before deploying, add these **Environment Variables**:

| Variable | Value |
|----------|-------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The `client_email` from your JSON key |
| `GOOGLE_PRIVATE_KEY` | The `private_key` from your JSON key (include the full string with `-----BEGIN...` and `-----END...`) |
| `GOOGLE_SHEET_ID` | Your Sheet ID from the URL |
| `ADMIN_PIN` | A 4-6 digit PIN to protect your dashboard (e.g., `4829`) |
| `NEXT_PUBLIC_APP_URL` | Leave blank for now, fill in after first deploy |

7. Click **Deploy**
8. Once deployed, copy your app URL (e.g., `https://laundry-pickup-abc123.vercel.app`)
9. Go back to **Settings → Environment Variables** and set `NEXT_PUBLIC_APP_URL` to your app URL
10. **Redeploy** (Deployments tab → click the three dots on latest → Redeploy)

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
cd laundry-pickup-app
vercel login
vercel
```

Follow the prompts, then add environment variables in the Vercel dashboard.

---

## Step 4: Add the "Pickup Responses" Tab to Your Sheet

The app will try to create this automatically on first use, but if it doesn't:

1. In your Google Sheet, add a new tab called **Pickup Responses**
2. In row 1, add these headers:
   - A1: `Week ID`
   - B1: `Area`
   - C1: `Email`
   - D1: `Day`
   - E1: `Timestamp`
   - F1: `Customer Name`

---

## How to Use (Your New Weekly Workflow)

### Day 1 Morning (e.g., Friday for Uptown)

1. Go to `https://your-app.vercel.app/dashboard`
2. Enter your PIN
3. Select **Uptown** (or Downtown)
4. Click **"Generate Links (All Customers)"**
5. For each customer, click **"Open in Gmail"** — this opens a pre-written email with their personalized Friday/Saturday buttons
6. Hit send for each one

> **Pro tip:** If you want to speed this up even more, you can copy each customer's message and paste it into a Gmail draft, then bulk-send. In a future version, we can add Gmail API integration to fully automate sending.

### Day 1 Evening / Day 2 Morning

1. Go to the dashboard
2. Click **"Friday Pickup List"** (or Tuesday for Downtown)
3. You'll see the route-sorted list with addresses, units, and entry methods
4. Click **"Print / Save as PDF"** to generate the driver's list
5. Click **"Get Remaining Emails"** to get the list of customers who haven't confirmed
6. Click **"Copy All Remaining Emails"** and paste into Gmail BCC
7. Or click **"Generate Links (Remaining Only)"** to send personalized follow-ups

### Day 2

1. Click **"Saturday Pickup List"** to generate the Day 2 driver list
2. Print/PDF and send to driver

---

## Troubleshooting

**"Unauthorized" error on dashboard**
→ Make sure your PIN matches the `ADMIN_PIN` environment variable in Vercel

**"Error: The caller does not have permission"**
→ Make sure you shared the Google Sheet with the service account email (Step 2)

**Customer clicks the link but gets an error**
→ Check that `NEXT_PUBLIC_APP_URL` is set correctly in Vercel environment variables and you redeployed after setting it

**"Pickup Responses" tab not created**
→ Create it manually (Step 4 above)

**Environment variable formatting for `GOOGLE_PRIVATE_KEY`**
→ Copy the ENTIRE private key from the JSON file, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. In Vercel, paste it as-is (the app handles newline conversion).

---

## Driver Photos (Pickup / Drop-off / Issue Confirmation)

Drivers photograph every pickup, drop-off, and any issue. Photos are stored
for **at least 30 days** and then deleted automatically by a daily cleanup job.

**Where things live:**
- **Image files** → Vercel Blob storage (public but unguessable URLs)
- **Metadata** (address, unit, type, status, time, photo link) → a **"Photos"
  tab** in your Google Sheet (created automatically on first upload)

### One-time setup

1. In your Vercel project, go to **Storage → Create Database → Blob** and
   connect the store to this project. Vercel sets `BLOB_READ_WRITE_TOKEN`
   automatically.
2. Add these environment variables in Vercel:

| Variable | Value |
|----------|-------|
| `DRIVER_PIN` | A PIN just for drivers (photo upload only). Optional — falls back to `ADMIN_PIN`. |
| `PHOTO_RETENTION_DAYS` | How long photos are kept. Default `30`. The app never deletes anything younger than 30 days, even if you set this lower. |
| `CRON_SECRET` | Any long random string. Vercel Cron uses it to authenticate the daily cleanup call. |

3. Redeploy. The daily cleanup cron (`vercel.json` → `/api/photos/cleanup`,
   8:00 UTC / ~3-4am ET) starts running automatically.

### How drivers use it

Drivers open **`https://your-app.vercel.app/driver`** on their phone:
1. Enter their PIN once (remembered on the phone)
2. Pick the area, PICK UP / DROP OFF / ISSUE, and DONE / NO BAG
3. Type the address (+ unit), tap **Take Photo** (opens the camera), upload

### How you view photos

On the **dashboard**, the **Driver Photos** card shows this week's photos by
day, newest first, with the address, type, status, and time. Every photo also
appears as a row in the **Photos** tab of your Google Sheet with a direct link.

You can run the cleanup manually anytime:
`https://your-app.vercel.app/api/photos/cleanup?pin=YOUR_ADMIN_PIN`

---

## Future Enhancements

These can be added later:
- **Gmail API integration** to auto-send all emails with one click (no more manual per-customer sending)
- **SMS notifications** via Twilio for customers who prefer texts
- **Automatic scheduling** — the app sends reminders on a schedule without you doing anything
- **Driver route view** — a mobile-friendly page the driver opens to see their route with map links
- **Bubble integration** — sync confirmations and bag weights with your existing Bubble app
