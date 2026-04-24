import React, { useState, useRef } from 'react';
import { Upload, Camera, X, TrendingUp, DollarSign, Zap } from 'lucide-react';
import Tesseract from 'tesseract.js';

const RATE_SHEET = [
  { miles: 92, rate: 15.89 },
  { miles: 92, rate: 8.75 },
  { miles: 92, rate: 16.25 },
  { miles: 27, rate: 7.10 },
  { miles: 61, rate: 14.40 },
  { miles: 65, rate: 15.42 },
  { miles: 27, rate: 7.61 },
  { miles: 11, rate: 5.06 },
  { miles: 39, rate: 10.26 },
  { miles: 2, rate: 3.84 },
  { miles: 14, rate: 5.68 },
  { miles: 25, rate: 7.32 },
  { miles: 45, rate: 11.24 },
  { miles: 8, rate: 4.65 },
  { miles: 3, rate: 3.97 },
  { miles: 21, rate: 6.75 },
  { miles: 17, rate: 6.00 },
  { miles: 6, rate: 4.38 },
  { miles: 13, rate: 5.12 },
  { miles: 14, rate: 5.18 },
  { miles: 16, rate: 6.03 },
  { miles: 30, rate: 8.01 },
  { miles: 49, rate: 10.15 },
  { miles: 13, rate: 5.85 },
  { miles: 13, rate: 5.41 },
  { miles: 62, rate: 14.72 },
];

const findRateForMileage = (targetMiles) => {
  return RATE_SHEET.find(entry => entry.miles === targetMiles);
};

export default function PayCalculator() {
  const [mileages, setMileages] = useState([]);
  const [tonnage, setTonnage] = useState(24);
  const [commission, setCommission] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processImage = async (file) => {
    setIsProcessing(true);
    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => console.log(m),
      });
      
      const text = result.data.text;
      const numbers = text.match(/\b\d+\b/g) || [];
      const extractedMiles = numbers.map(n => parseInt(n)).filter(n => n > 0 && n < 500);
      
      setMileages([...mileages, ...extractedMiles]);
      setManualInput('');
    } catch (error) {
      alert('Error processing image: ' + error.message);
    }
    setIsProcessing(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const addManualMileage = () => {
    const miles = parseInt(manualInput);
    if (!isNaN(miles) && miles > 0) {
      setMileages([...mileages, miles]);
      setManualInput('');
    }
  };

  const removeMileage = (index) => {
    setMileages(mileages.filter((_, i) => i !== index));
  };

  const calculatePay = (mileageValue) => {
    const rate = findRateForMileage(mileageValue);
    if (!rate) return null;
    
    const basePay = mileageValue * rate.rate;
    const withTonnage = basePay * (tonnage / 100);
    const commissionAmount = withTonnage * (commission / 100);
    
    return {
      miles: mileageValue,
      rate: rate.rate,
      basePay,
      withTonnage,
      commissionAmount,
    };
  };

  const calculations = mileages
    .map(m => calculatePay(m))
    .filter(Boolean);

  const totalPay = calculations.reduce((sum, c) => sum + c.commissionAmount, 0);
  const totalMiles = calculations.reduce((sum, c) => sum + c.miles, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * {
          font-family: 'DM Sans', sans-serif;
        }
        
        h1, h2, .font-mono {
          font-family: 'Space Mono', monospace;
        }

        .input-focus:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .card {
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.6) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .badge {
          background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        }

        .button-upload {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .button-upload:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
        }

        .button-upload:active {
          transform: translateY(0);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation: slideIn 0.4s ease-out;
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-lg bg-blue-600/20 border border-blue-500/30">
              <DollarSign className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              TruckPay
            </h1>
          </div>
          <p className="text-slate-400 text-sm">Professional pay breakdown calculator for trucking operations</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Input Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upload Section */}
            <div className="card rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-300 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Mileage Input
              </h2>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="button-upload bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition"
                >
                  <Upload className="w-4 h-4" />
                  {isProcessing ? 'Processing...' : 'Upload Photo'}
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isProcessing}
                  className="button-upload bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition"
                >
                  <Camera className="w-4 h-4" />
                  Take Photo
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraCapture}
                className="hidden"
              />

              {/* Manual Entry */}
              <div className="border-t border-slate-700 pt-4 space-y-3">
                <p className="text-sm text-slate-400">Or enter mileage manually</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addManualMileage()}
                    placeholder="Enter miles..."
                    className="input-focus flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                  />
                  <button
                    onClick={addManualMileage}
                    className="button-upload bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg font-medium transition"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="card rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-blue-300">Settings</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Tonnage
                  </label>
                  <input
                    type="number"
                    value={tonnage}
                    onChange={(e) => setTonnage(parseFloat(e.target.value))}
                    className="input-focus w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Commission %
                  </label>
                  <input
                    type="number"
                    value={commission}
                    onChange={(e) => setCommission(parseFloat(e.target.value))}
                    className="input-focus w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="card rounded-xl p-6 space-y-6 sticky top-6 h-fit">
            <div>
              <p className="text-slate-400 text-sm mb-2">Total Pay</p>
              <p className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent font-mono">
                ${totalPay.toFixed(2)}
              </p>
            </div>

            <div className="space-y-3 border-t border-slate-700 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total Miles</span>
                <span className="font-mono font-semibold">{totalMiles}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Avg Rate/Mile</span>
                <span className="font-mono font-semibold">
                  ${totalMiles > 0 ? (calculations.reduce((sum, c) => sum + c.rate, 0) / calculations.length).toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Trips Logged</span>
                <span className="font-mono font-semibold text-blue-400">{calculations.length}</span>
              </div>
            </div>

            {calculations.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">
                <p>Add mileage to see breakdown</p>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Table */}
        {calculations.length > 0 && (
          <div className="mt-8 card rounded-xl p-6 animate-in">
            <h2 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Detailed Breakdown
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Miles</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">Rate</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">Base Pay</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">w/ Tonnage</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">Your Pay (30%)</th>
                    <th className="text-center py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.map((calc, idx) => (
                    <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono font-semibold">{calc.miles}</td>
                      <td className="py-3 px-4 text-right font-mono">${calc.rate.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">${calc.basePay.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-blue-300">${calc.withTonnage.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-green-400">${calc.commissionAmount.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => removeMileage(idx)}
                          className="p-1 hover:bg-red-600/20 rounded transition text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {calculations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700 flex justify-end">
                <div className="text-right">
                  <p className="text-slate-400 text-sm mb-2">Total Commission</p>
                  <p className="text-2xl font-bold font-mono text-green-400">
                    ${totalPay.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
