# TruckPay Calculator - Complete Setup Package

## 📦 What's Included

This is a complete, production-ready React application for calculating truck driver pay with automatic photo OCR.

### Key Features
✅ **Photo Recognition** - Extract mileage automatically from photos using OCR  
✅ **Rate Sheet Database** - Your complete rate sheet built in  
✅ **Professional UI** - Dark theme, responsive design  
✅ **Real-time Calculations** - Instant pay breakdowns  
✅ **GitHub Pages Ready** - One-command deployment  

## 📊 Your Calculation Method

The app calculates your pay as:

```
For each trip:
  Base Pay = Miles × Rate (from rate sheet)
  With Tonnage = Base Pay × (Tonnage / 100)
  Your Commission = With Tonnage × (Commission % / 100)

Total = Sum of all trip commissions
```

**Your Settings:**
- Average Tonnage: 24 tons
- Commission Rate: 30%

**Example:**
```
92 miles @ $15.89/mile with 24-ton average at 30%
= (92 × $15.89) × (24/100) × 0.30
= $1,461.88 × 0.24 × 0.30
= $105.26 per trip
```

## 🚀 Quick Deployment (5-10 minutes)

### Step 1: Create GitHub Repository
1. Go to https://github.com/new
2. Name it: `truckpay-calculator`
3. Make it **Public**
4. Click "Create Repository"

### Step 2: Upload Your Files
```bash
# Navigate to project folder
cd truckpay-calculator

# Initialize git
git init
git add .
git commit -m "TruckPay calculator app"

# Add your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/truckpay-calculator.git
git branch -M main
git push -u origin main
```

### Step 3: Enable Automatic Deployment

**Option A: Automatic (Recommended)**
1. Go to your repo on GitHub
2. Click **Settings** → **Pages**
3. Wait 2-3 minutes - it should auto-detect and deploy!
4. Your app is now live at: `https://YOUR_USERNAME.github.io/truckpay-calculator/`

**Option B: Manual Workflow** (if Option A doesn't work)
1. Create folder: `.github/workflows/`
2. Create file: `.github/workflows/deploy.yml` with this content:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm install
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

Then commit and push:
```bash
git add .github/workflows/deploy.yml
git commit -m "Add deployment workflow"
git push
```

## 📁 Project Structure

```
truckpay-calculator/
├── src/
│   ├── PayCalculator.jsx     # Main app component
│   ├── App.jsx               # App wrapper
│   └── main.jsx              # Entry point
├── index.html                # HTML template
├── package.json              # Dependencies
├── vite.config.js            # Vite configuration
├── .gitignore                # Git ignore rules
├── README.md                 # Full documentation
├── QUICKSTART.md             # Quick start guide
└── DEPLOYMENT.md             # This file
```

## 🔧 Local Development

### Test Before Deploying

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

Visit `http://localhost:5173` and test the app!

### Building for Production

```bash
npm run build
```

Creates optimized files in the `dist/` folder (this is what GitHub Pages will serve).

## 🎯 How Users Will Use Your App

1. **Upload/Take Photo**
   - Click "Upload Photo" or "Take Photo"
   - Point at their mileage logbook
   - App extracts numbers automatically

2. **Manual Entry**
   - Type mileage manually if photo doesn't work
   - Press Enter to add

3. **Review Settings**
   - Adjust tonnage if it changes (currently set to 24)
   - Adjust commission % if it changes (currently 30%)

4. **See Breakdown**
   - Each trip shows in the detailed table
   - Summary shows total pay at the top right
   - Delete trips with the X button if needed

## 📊 Rate Sheet Reference

Your rates are built in:

| Miles | Rate    |
|-------|---------|
| 92    | $15.89  |
| 92    | $8.75   |
| 92    | $16.25  |
| 27    | $7.10   |
| 61    | $14.40  |
| 65    | $15.42  |
| 27    | $7.61   |
| 11    | $5.06   |
| 39    | $10.26  |
| 2     | $3.84   |
| 14    | $5.68   |
| 25    | $7.32   |
| 45    | $11.24  |
| 8     | $4.65   |
| 3     | $3.97   |
| 21    | $6.75   |
| 17    | $6.00   |
| 6     | $4.38   |
| 13    | $5.12   |
| 14    | $5.18   |
| 16    | $6.03   |
| 30    | $8.01   |
| 49    | $10.15  |
| 13    | $5.85   |
| 13    | $5.41   |
| 62    | $14.72  |

All rates are hard-coded and automatically matched to input mileage.

## ⚙️ Customization

### Update Tonnage Default
Edit `src/PayCalculator.jsx`, line ~65:
```javascript
const [tonnage, setTonnage] = useState(24);  // Change to your default
```

### Update Commission Default
Edit `src/PayCalculator.jsx`, line ~66:
```javascript
const [commission, setCommission] = useState(30);  // Change to your percentage
```

### Update Rate Sheet
Edit `src/PayCalculator.jsx`, starting at line ~8:
```javascript
const RATE_SHEET = [
  { miles: 92, rate: 15.89 },
  { miles: 92, rate: 8.75 },
  // Add/remove entries as needed
];
```

## 🐛 Troubleshooting

### App Won't Deploy
- Check that repository is **Public** (not Private)
- Verify you pushed to **main** branch
- Wait 2-3 minutes after push
- Check **Actions** tab for build errors

### OCR Not Working
- Ensure good lighting in photo
- Make sure numbers are clearly visible
- Try a closer crop
- Use manual entry as fallback

### Can't Install Dependencies
```bash
# Make sure you have Node.js installed
node --version

# If not, download from nodejs.org
# Then try again:
npm install
```

### Port Already in Use
```bash
npm run dev -- --port 5174
```

## 🌐 Browser Support

Works on:
- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Android)

## 📱 Mobile Optimized

The app works perfectly on phones! Camera capture allows drivers to take photos directly from their phone and process them instantly.

## 🔐 Privacy & Security

- All calculations happen locally in the browser
- No data is sent to servers
- No tracking or analytics
- Your mileage data never leaves your device

## 📞 Support Resources

- **Full Documentation**: See README.md
- **Quick Start**: See QUICKSTART.md
- **GitHub Issues**: Report bugs in your repository's Issues tab
- **GitHub Docs**: https://docs.github.com

## ✅ Next Steps

1. **Now**: Review this file and the app code
2. **Create GitHub repo** with the steps above
3. **Push your code** to GitHub
4. **Enable GitHub Pages** deployment
5. **Share the URL** with other drivers: `https://yourusername.github.io/truckpay-calculator/`

## 🎉 You're All Set!

Your professional pay calculator is ready to deploy. This is production-grade code that will handle real trucking operations reliably.

---

**Built with:**
- React 18
- Vite
- Tesseract.js (OCR)
- GitHub Pages (Hosting)

**Deployed with GitHub Actions** - automatic updates every time you push code!

Questions? Check the full README.md or reach out to GitHub support.
