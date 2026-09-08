# DriverPay Pro quick start

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173/truckpay-calculator/`.

Create an account with email and password, enter the verification code sent by email, and complete the required driver profile. Each authenticated driver receives separate cloud-backed settlements, loads, and ticket images.

Run all checks before committing:

```bash
npm run check
```
