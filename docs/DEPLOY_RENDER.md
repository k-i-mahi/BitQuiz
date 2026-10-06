# Deploying BitQuiz for free (Render + Neon)

BitQuiz runs on two free services:

| Service | What it hosts | Free plan |
| --- | --- | --- |
| [Render](https://render.com) | The BitQuiz app (one Docker web service) | 0.1 CPU, 512 MB RAM, sleeps after 15 minutes with no visitors |
| [Neon](https://neon.com) | PostgreSQL database | 1 GB storage, 100 compute hours/month, no credit card, never expires |

Don't use Render's own free database: it is deleted 30 days after creation.

Total time: about 15 minutes.

## 1. Create the database on Neon

1. Sign up at [neon.com](https://neon.com) (GitHub login works).
2. Create a project: name `bitquiz`, region **AWS Asia Pacific (Singapore)**, Postgres 16 or newer.
3. On the project dashboard click **Connect**. You need two connection strings:
   - **Pooled** (the host contains `-pooler`). Add `&pgbouncer=true` to the end. This becomes `DATABASE_URL`.
   - **Direct** (turn the *Connection pooling* switch off). This becomes `DIRECT_URL`.

They look like this:

```text
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Why two: the app talks to the database through Neon's pooler, which keeps working when Neon's free database goes to sleep. Migrations need the direct connection.

## 2. Deploy the app on Render

1. Sign up at [render.com](https://render.com) with your GitHub account and allow access to the `BitQuiz` repository.
2. **New → Blueprint**, pick the `BitQuiz` repository. Render reads [`render.yaml`](../render.yaml) and proposes one free web service in Singapore.
3. Fill in the values it asks for:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled string with `&pgbouncer=true` |
   | `DIRECT_URL` | Neon direct string |
   | `SEED_ADMIN_EMAIL` | Your organizer email |
   | `SEED_ADMIN_PASSWORD` | A strong password (min 8 characters) |

   `SESSION_SECRET` is generated automatically. `PUBLIC_URL` defaults to the service's `https://….onrender.com` address.

4. Click **Apply**. The first build takes 5–10 minutes. On start the container creates the tables and your owner account.
5. Open `https://<your-service>.onrender.com/admin` and log in.

Every push to `main` redeploys automatically.

## 3. Email (optional)

BitQuiz works without email: invitations come with a link you can share yourself, and a forgotten password is reset with a command (see [Locked out](#locked-out)). Set up email only if you want invitations, verification and password resets to be emailed automatically.

### Turn on email with Brevo (free)

Invitations, password resets and email verification are sent by email. **Render's free plan blocks the SMTP ports (25, 465, 587)**, so Gmail SMTP cannot work there. BitQuiz sends through **Brevo's HTTPS API** instead: free for 300 emails a day, no domain needed.

1. Create a free account at [brevo.com](https://www.brevo.com).
2. Add your sender: **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Use the address emails should come from (your Gmail works). Brevo emails you a confirmation link; open it.
3. Create an API key: **SMTP & API → API Keys → Generate a new API key**, name it `BitQuiz`, and copy it (it starts with `xkeysib-`).
4. In Render → **bitquiz** → **Environment**, set:

   | Key | Value |
   | --- | --- |
   | `BREVO_API_KEY` | The key from step 3 |
   | `MAIL_FROM` | `BitQuiz <the sender address from step 2>` |

   If you added `SMTP_*` variables earlier, delete them; they can't work on Render's free plan.

5. Save. After Render restarts, open **Team & access** and press **Send test email**.

If the test email lands in spam, mark it "Not spam" once. Because a Gmail address is sent through Brevo, some providers may be cautious; using your own domain in Brevo gives the best delivery.

**Email isn't required to invite people.** When you invite someone, BitQuiz always shows the invitation link with a **Copy** button, so you can send it on WhatsApp or Messenger if the email doesn't arrive.

### Running somewhere else (VPS or venue laptop)

Servers that allow SMTP can use any mail server instead of Brevo, for example Gmail with an [app password](https://support.google.com/accounts/answer/185833): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-character app password>`. If `BREVO_API_KEY` is set, Brevo is used.

## 4. How the free plan behaves

- **Sleeping.** After 15 minutes with no visitors Render stops the app. The next visit wakes it, which takes about a minute. An open Game Master console keeps it awake, because its live connection counts as activity.
- **Database sleep.** Neon pauses after 5 minutes without queries and resumes in under a second on the next one. Render's health check uses `/healthz`, which doesn't touch the database, so idle time doesn't use up Neon's compute hours.
- **Restarts.** If Render restarts the app mid-quiz, nothing is lost: all state is in the database, open questions are re-timed on start, and phones reconnect by themselves.

## 5. Before the event (important)

The free app server is small (0.1 CPU). Test it with a full-size simulated competition **at least two days before**:

```bash
npm run loadtest -- --url https://<your-service>.onrender.com --email <admin email> --password <admin password> --players 300 --questions 5
```

- **PASS:** use Render for the event. Open the console 10 minutes early so the app is awake.
- **FAIL:** use either of these instead:
  - **Free:** run BitQuiz on a laptop at the venue (`docker compose --profile app up -d`, see the README). For phones on mobile data, expose it with a free Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:3000`. Then set `PUBLIC_URL` to the tunnel address and restart.
  - **Paid, for one month:** switch the Render service to the Starter plan, then back to Free after the event.

The load test creates and archives a throwaway competition; it doesn't touch real ones.

## 6. Custom domain (optional)

Render → service → **Settings → Custom Domains**. Add the domain, create the DNS record it shows, then set `PUBLIC_URL` to `https://your-domain` so the QR code uses it.

## Locked out

Without email, reset a password from your own computer against the production database. In PowerShell, in the project folder:

```powershell
$env:DATABASE_URL = "<Neon direct connection string>"
$env:DIRECT_URL   = "<Neon direct connection string>"
npm run admin:set-password -w server -- you@example.com
```

Use the **direct** (non-pooled) string for both. The command asks for the new password twice, signs out existing sessions and reactivates the account. Close the terminal afterwards so the connection string isn't left in it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Deploy fails with `DIRECT_URL is required` | Add the `DIRECT_URL` environment variable |
| `prepared statement … already exists` errors | `&pgbouncer=true` is missing from `DATABASE_URL` |
| Can't log in after deploy | Check the deploy log for `Created owner …`. The owner is only created if no account with that email exists |
| QR code points to the wrong address | Set `PUBLIC_URL` and redeploy |
| "Send test email" fails with "Could not reach the SMTP server" | Render free blocks SMTP. Use Brevo (`BREVO_API_KEY`, `MAIL_FROM`) |
| Brevo rejects the email (401) | The API key is wrong or was deleted; create a new one |
| Brevo rejects the email (400, sender) | `MAIL_FROM` must be a sender you confirmed in Brevo |
| Emails land in spam | Mark the first one as "Not spam"; for the best delivery, authenticate your own domain in Brevo |
| First page load takes a minute | The free app was asleep. Open it a few minutes before you need it |
