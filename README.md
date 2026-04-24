# TruckPay Calculator

A professional pay breakdown calculator for trucking operations with automatic mileage extraction from photos using OCR.

## Features

✅ **Photo OCR Recognition** - Automatically extract mileage data from photos using Tesseract.js  
✅ **Camera Support** - Take photos directly from your device  
✅ **Manual Entry** - Add mileage data manually  
✅ **Rate Sheet Database** - Built-in rate matching system  
✅ **Detailed Breakdown** - See full calculation details for each trip  
✅ **Professional Design** - Modern, dark-themed UI optimized for readability  
✅ **Real-time Calculations** - Instant pay calculations with tonnage and commission adjustments  

## Calculation Method

The calculator uses the following formula for each trip:

```
Base Pay = Miles × Rate
With Tonnage = Base Pay × (Tonnage / 100)
Your Pay = With Tonnage × (Commission % / 100)
```

**Example:**
- 92 miles at $15.89/mile with 24-ton average at 30% commission
- Base: 92 × $15.89 = $1,461.88
- Tonnage: $1,461.88 × (24/100) = $350.85
- Your Pay: $350.85 × 0.30 = **$105.26**

## Setup & Installation

### Prerequisites
- Node.js 16+ 
- npm or yarn
- GitHub account (for deployment)

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/truckpay-calculator.git
cd truckpay-calculator
```

2. **Install dependencies**
```bash
npm install
```

3. **Start development server**
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` folder.

## Deployment to GitHub Pages

### Step 1: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Create a new public repository named `truckpay-calculator`
3. Don't initialize with README yet (we'll push our files)

### Step 2: Push Code to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: TruckPay calculator app"

# Add your GitHub repository as remote
git remote add origin https://github.com/yourusername/truckpay-calculator.git

# Push to main branch
git branch -M main
git push -u origin main
```

### Step 3: Enable GitHub Pages Deployment

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Build and deployment":
   - Source: Select **GitHub Actions**
4. Create a workflow file or use the auto-generated one

### Step 4: Create GitHub Actions Workflow (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

Save this file and commit:
```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deployment workflow"
git push
```

### Step 5: Verify Deployment

1. Go to your repository **Settings** → **Pages**
2. Look for the deployment message: "Your site is live at https://yourusername.github.io/truckpay-calculator"
3. Click the link to view your live app!

## How to Use

### Adding Mileage via Photo

1. Click **Upload Photo** or **Take Photo**
2. Select or capture an image of your mileage logbook
3. The app automatically extracts numbers and matches them to your rate sheet
4. Numbers are added to your breakdown

### Manual Entry

1. Type a mileage value in the manual input field
2. Press Enter or click **Add**
3. The app finds the matching rate and calculates your pay

### Adjusting Settings

- **Tonnage**: Set your average tonnage (default: 24)
- **Commission %**: Set your commission rate (default: 30%)

### Viewing Breakdown

The detailed breakdown table shows:
- **Miles**: Trip mileage
- **Rate**: $/mile from rate sheet
- **Base Pay**: Miles × Rate
- **w/ Tonnage**: Base Pay adjusted for tonnage
- **Your Pay**: Your 30% commission

## Rate Sheet Reference

The app includes the complete rate sheet:

| Miles | Rate    | Miles | Rate    |
|-------|---------|-------|---------|
| 92    | $15.89  | 21    | $6.75   |
| 92    | $8.75   | 17    | $6.00   |
| 92    | $16.25  | 6     | $4.38   |
| 27    | $7.10   | 13    | $5.12   |
| 61    | $14.40  | 14    | $5.18   |
| 65    | $15.42  | 16    | $6.03   |
| 27    | $7.61   | 30    | $8.01   |
| 11    | $5.06   | 49    | $10.15  |
| 39    | $10.26  | 13    | $5.85   |
| 2     | $3.84   | 13    | $5.41   |
| 14    | $5.68   | 62    | $14.72  |
| 25    | $7.32   | ... and more |

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

OCR works best with clear, well-lit photos of printed or digital mileage displays.

## Technical Stack

- **React 18** - UI framework
- **Vite** - Fast build tool
- **Tesseract.js** - Client-side OCR
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Troubleshooting

### OCR Not Extracting Numbers

- Ensure good lighting in the photo
- Make sure numbers are clearly visible
- Try a closer crop of the mileage section
- Use manual entry as fallback

### Rate Not Found for Mileage

The app only calculates pay for mileages that exist in the rate sheet. If your mileage isn't found:
1. Check the mileage value is correct
2. Verify it's in the rate sheet
3. Use manual entry to add the mileage

### Deployment Issues

If your site isn't live after push:
1. Check **Settings** → **Pages** - confirm correct branch/folder
2. Verify workflow file has correct syntax
3. Check GitHub Actions tab for build errors
4. Ensure repository is public

## Development

### Project Structure

```
truckpay-calculator/
├── src/
│   ├── PayCalculator.jsx    # Main calculator component
│   ├── App.jsx              # App wrapper
│   └── main.jsx             # Entry point
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies
└── README.md                # This file
```

### Adding More Rates

Edit the `RATE_SHEET` array in `src/PayCalculator.jsx`:

```javascript
const RATE_SHEET = [
  { miles: 92, rate: 15.89 },
  { miles: 92, rate: 8.75 },
  // Add more entries as needed
];
```

## Support & Contributions

Found an issue or have a feature request? Please open an issue on GitHub!

## License

MIT - Feel free to modify and use this app

---

**Made for professional truckers.** 🚛

Built with React, Vite, and a commitment to accuracy.
