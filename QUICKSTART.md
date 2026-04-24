# Quick Start Guide

## For Non-Technical Users

### Using the App (Already Deployed)

If someone already deployed the app to GitHub Pages, you can just:

1. Go to: `https://yourusername.github.io/truckpay-calculator/`
2. Click **Upload Photo** or **Take Photo**
3. Point at your mileage logbook
4. Adjust tonnage/commission if needed
5. See your pay breakdown!

### For Deploying Yourself

#### What You Need
- Free GitHub account (github.com)
- Command line/Terminal (Mac) or Command Prompt (Windows)
- Node.js installed ([nodejs.org](https://nodejs.org))

#### 5-Minute Setup

1. **Copy files to your computer**
   - Download this entire folder (click Code → Download ZIP on GitHub)
   - Extract the ZIP file

2. **Open Terminal/Command Prompt**
   - Mac: Press `Cmd + Space`, type "Terminal"
   - Windows: Press `Windows + R`, type "cmd"
   - Navigate to the folder: `cd path/to/truckpay-calculator`

3. **Install dependencies**
   ```
   npm install
   ```

4. **Run locally** (to test first)
   ```
   npm run dev
   ```
   - Open `http://localhost:5173` in your browser
   - Try uploading a photo!

5. **Create GitHub repository**
   - Go to [github.com/new](https://github.com/new)
   - Name it `truckpay-calculator`
   - Create the repository

6. **Upload your code to GitHub**
   ```
   git init
   git add .
   git commit -m "TruckPay calculator"
   git remote add origin https://github.com/YOUR_USERNAME/truckpay-calculator.git
   git branch -M main
   git push -u origin main
   ```

7. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - GitHub should auto-detect and deploy
   - Your app goes live in 2-3 minutes!
   - Visit: `https://YOUR_USERNAME.github.io/truckpay-calculator/`

#### Troubleshooting Setup

**"npm: command not found"**
- Install Node.js from nodejs.org
- Restart Terminal/Command Prompt

**"git: command not found"**
- Install Git from git-scm.com

**"Port already in use"**
- Close other apps using port 5173
- Or change the port: `npm run dev -- --port 5174`

## App Features

### Photo Recognition
- **Best results**: Clear, well-lit photos of mileage displays
- Works with: Phone camera, screenshots, printed logs
- Extracts numbers and matches to your rate sheet

### Settings Explained

**Tonnage (24 default)**
- Average weight of your loads
- Used in pay calculation: `Pay × (Tonnage / 100)`

**Commission % (30 default)**
- Percentage you earn from the base pay
- Change based on your contract

### Calculation Example

If you drive:
- **92 miles** at **$15.89/mile**
- **24-ton average** at **30% commission**

The app calculates:
1. Base: 92 × $15.89 = $1,461.88
2. With tonnage: $1,461.88 × 0.24 = $350.85
3. Your pay: $350.85 × 0.30 = **$105.26**

## Tips for Best Results

✅ Good lighting when taking photos  
✅ Center the mileage display in frame  
✅ Keep phone steady (use both hands)  
✅ Update tonnage/commission if they change  
✅ Review breakdown before submitting  

---

**Questions?** Check the full README.md for technical details!
