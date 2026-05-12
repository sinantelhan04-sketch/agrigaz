/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, ReactNode } from 'react';
import { 
  Calculator, 
  Calendar, 
  Gauge, 
  MapPin, 
  Receipt, 
  ArrowUpRight, 
  AlertCircle,
  Info,
  ChevronDown,
  TrendingDown,
  TrendingUp,
  Download,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CITY_MONTHLY_DATA, CITIES } from './constants';

// --- Types ---

interface CalculationResults {
  hamTuketim: number;
  okumaGunu: number;
  gunlukSm3: number;
  period1: PeriodData;
  period2: PeriodData;
  toplamKdvsiz: number;
  kdv: number;
  toplamOdeme: number;
}

interface PeriodData {
  ayAdi: string;
  gunSayisi: number;
  baslangic: string;
  bitis: string;
  isK1: boolean;
  limitSm3: number; // Daily limit
  toplamLimitSm3: number; // Total limit for the period duration
  enerjiKwh: number;
  tuketimSm3: number; // Consumption in Sm3 for the period
  gunlukOrtalama: number; // Daily average consumption
  fiyat: number;
  tutar: number;
  formula: string;
}

// --- Utils ---

const fmt = (n: number, d = 2) => 
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const fmtCur = (n: number) => 
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

const getAyAdi = (date: Date) => 
  ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][date.getMonth()];

const tarihFark = (d1: string, d2: string) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return Math.round(Math.abs(date2.getTime() - date1.getTime()) / (1000 * 3600 * 24));
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export default function App() {
  // --- States ---
  const [sehir, setSehir] = useState('İstanbul');
  const [ilkTarih, setIlkTarih] = useState('2026-04-07');
  const [sonTarih, setSonTarih] = useState('2026-05-10');
  const [ilkEndeks, setIlkEndeks] = useState(0);
  const [sonEndeks, setSonEndeks] = useState(0);
  const [duzeltme, setDuzeltme] = useState(1);
  const [ofid, setOfid] = useState(10.64);
  const [tuketimSm3, setTuketimSm3] = useState(0);
  const [p1K1Fiyat, setP1K1Fiyat] = useState(0);
  const [p1K2Fiyat, setP1K2Fiyat] = useState(0);
  const [p2K1Fiyat, setP2K1Fiyat] = useState(0);
  const [p2K2Fiyat, setP2K2Fiyat] = useState(0);
  const [yuvarlama, setYuvarlama] = useState(0);
  const [gecikme, setGecikme] = useState(0);
  const [botasPeriod1Limit, setBotasPeriod1Limit] = useState(9.6173); // Nisan default
  const [botasPeriod2Limit, setBotasPeriod2Limit] = useState(4.167);  // Mayıs default

  const [results, setResults] = useState<CalculationResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Logic ---
  const calculate = () => {
    setError(null);

    const ilkD = new Date(ilkTarih);
    const sonD = new Date(sonTarih);

    if (isNaN(ilkD.getTime()) || isNaN(sonD.getTime())) {
      setError('Lütfen geçerli okuma tarihleri girin.');
      return;
    }

    if (sonD <= ilkD) {
      setError('Son okuma tarihi ilk okuma tarihinden sonra olmalıdır.');
      return;
    }

    if (sonEndeks <= ilkEndeks) {
      setError('Son endeks, ilk endeksten büyük olmalıdır.');
      return;
    }

    const hamTuketim = sonEndeks - ilkEndeks;
    const okumaGunu = tarihFark(ilkTarih, sonTarih) + 1;
    const gunlukSm3 = tuketimSm3 / okumaGunu;

    const ilkYil = ilkD.getFullYear();
    const ilkAyIndex = ilkD.getMonth();
    const sonYil = sonD.getFullYear();
    const sonAyIndex = sonD.getMonth();

    // Determine segments (assuming max 2 months span for this simple tool)
    const ilkAyBitis = new Date(ilkYil, ilkAyIndex + 1, 0);
    const ilkAyBitisStr = ilkAyBitis.toISOString().split('T')[0];
    
    // Period 1: Start Date to End of Start Month
    const initialP1Days = Math.min(okumaGunu, tarihFark(ilkTarih, ilkAyBitisStr) + 1);
    const p1Days = Math.min(okumaGunu, initialP1Days + 1); // User requested +1
    
    // Period 2: Start of End Month to End Date
    const p2Days = Math.max(0, okumaGunu - p1Days); // Remainder (effectively -1 if p1 increased)

    const createPeriodData = (
      name: string, 
      days: number, 
      limit: number, 
      startStr: string, 
      endStr: string,
      k1: number,
      k2: number
    ): PeriodData => {
      const isK1 = gunlukSm3 <= limit;
      const energy = (hamTuketim * duzeltme * ofid * days) / okumaGunu;
      const pTuketimSm3 = (tuketimSm3 * days) / okumaGunu;
      const pGunlukOrtalama = days > 0 ? pTuketimSm3 / days : 0;
      const pToplamLimitSm3 = limit * days;
      const price = isK1 ? k1 : k2;
      const amount = pTuketimSm3 * price;

      return {
        ayAdi: name,
        gunSayisi: days,
        baslangic: startStr,
        bitis: endStr,
        isK1,
        limitSm3: limit,
        toplamLimitSm3: pToplamLimitSm3,
        enerjiKwh: energy,
        tuketimSm3: pTuketimSm3,
        gunlukOrtalama: pGunlukOrtalama,
        fiyat: price,
        tutar: amount,
        formula: `((${sonEndeks}-${ilkEndeks}) × ${duzeltme} × ${days} / ${okumaGunu}) × ${price}`
      };
    };

    const p1Start = ilkTarih;
    const p1End = ilkAyBitisStr;
    const p2Start = new Date(sonYil, sonAyIndex, 1).toISOString().split('T')[0];
    const p2End = sonTarih;

    const period1 = createPeriodData(getAyAdi(ilkD), p1Days, botasPeriod1Limit, p1Start, p1End, p1K1Fiyat, p1K2Fiyat);
    const period2 = createPeriodData(getAyAdi(sonD), p2Days, botasPeriod2Limit, p2Start, p2End, p2K1Fiyat, p2K2Fiyat);

    const toplamKdvsiz = period1.tutar + period2.tutar;
    const kdv = toplamKdvsiz * 0.20;
    const toplamOdeme = toplamKdvsiz + kdv + yuvarlama + gecikme;

    setResults({
      hamTuketim,
      okumaGunu,
      gunlukSm3,
      period1,
      period2,
      toplamKdvsiz,
      kdv,
      toplamOdeme
    });
  };

  // Auto-calculate on initial load with defaults
  useEffect(() => {
    calculate();
  }, []);

  // Update BOTAŞ limits when city or dates change
  useEffect(() => {
    const d1 = new Date(ilkTarih);
    const d2 = new Date(sonTarih);
    
    if (CITY_MONTHLY_DATA[sehir] && !isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const month1 = d1.getMonth();
      const month2 = d2.getMonth();
      
      const monthly1 = CITY_MONTHLY_DATA[sehir][month1];
      const monthly2 = CITY_MONTHLY_DATA[sehir][month2];
      
      const days1 = getDaysInMonth(d1.getFullYear(), month1);
      const days2 = getDaysInMonth(d2.getFullYear(), month2);
      
      setBotasPeriod1Limit(Number((monthly1 / days1).toFixed(4)));
      setBotasPeriod2Limit(Number((monthly2 / days2).toFixed(4)));
    }
  }, [sehir, ilkTarih, sonTarih]);

  // Sync Total Consumption (Sm3) when indices or K factor changes
  useEffect(() => {
    const calculatedSm3 = Math.max(0, (sonEndeks - ilkEndeks) * duzeltme);
    setTuketimSm3(Number(calculatedSm3.toFixed(2)));
  }, [ilkEndeks, sonEndeks, duzeltme]);

  // Auto-calculate results whenever any parameter changes
  useEffect(() => {
    calculate();
  }, [
    sehir, ilkTarih, sonTarih, ilkEndeks, sonEndeks, 
    duzeltme, ofid, tuketimSm3, 
    p1K1Fiyat, p1K2Fiyat, p2K1Fiyat, p2K2Fiyat, 
    yuvarlama, gecikme, botasPeriod1Limit, botasPeriod2Limit
  ]);

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-10 min-h-screen">
      <header className="mb-12 flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-border-subtle">
        <div className="text-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent shadow-sm border border-accent/20">
              <Calculator className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight uppercase">FATURA <span className="text-accent">HESAPLAMA</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Fatura Dönemi</p>
            <p className="text-sm font-bold text-text-primary">{new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex gap-2">
            <button className="p-2.5 bg-surface border border-border-subtle rounded-xl text-text-secondary hover:text-accent hover:border-accent transition-all shadow-sm">
              <Download className="w-5 h-5" />
            </button>
            <button className="p-2.5 bg-accent text-white rounded-xl shadow-lg shadow-accent/20 hover:bg-accent-hover transition-all">
              <Receipt className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_400px] gap-8 items-start">
        {/* Left Column: Inputs (Sidebar) */}
        <div className="space-y-6 lg:sticky lg:top-8">
          <div className="flex items-center gap-2 mb-2 text-text-primary font-bold text-xs uppercase tracking-widest pl-1">
            <TrendingUp className="w-4 h-4 text-accent" />
            Yapılandırma Paneli
          </div>

          <SectionCard title="Konum ve Abone" icon={<MapPin className="w-4 h-4" />}>
            <div className="grid gap-5">
              <div>
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Şehir / Dağıtım Şirketi</label>
                <div className="relative">
                  <select 
                    value={sehir}
                    onChange={(e) => setSehir(e.target.value)}
                    className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all appearance-none cursor-pointer"
                  >
                    {CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-secondary absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Okuma Verileri" icon={<Gauge className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">İlk Okuma</label>
                <input 
                  type="date" 
                  value={ilkTarih}
                  onChange={(e) => setIlkTarih(e.target.value)}
                  className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-xs text-text-primary outline-none focus:border-accent transition-all"
                />
              </div>
              <div className="col-span-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Son Okuma</label>
                <input 
                  type="date" 
                  value={sonTarih}
                  onChange={(e) => setSonTarih(e.target.value)}
                  className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-xs text-text-primary outline-none focus:border-accent transition-all"
                />
              </div>
              <div className="col-span-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">İlk Endeks</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={ilkEndeks}
                    onChange={(e) => setIlkEndeks(Number(e.target.value))}
                    className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary outline-none focus:border-accent transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-secondary/50">m³</span>
                </div>
              </div>
              <div className="col-span-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Son Endeks</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={sonEndeks}
                    onChange={(e) => setSonEndeks(Number(e.target.value))}
                    className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary outline-none focus:border-accent transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-secondary/50">m³</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Tarife ve Teknik" icon={<Receipt className="w-4 h-4" />}>
            <div className="grid gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">K Katsayısı</label>
                  <input 
                    type="number" step="0.00001"
                    value={duzeltme}
                    onChange={(e) => setDuzeltme(Number(e.target.value))}
                    className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary outline-none focus:border-accent transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Ort. Fiili Üst Is. Değ. Kwh/m3</label>
                  <input 
                    type="number" step="0.001"
                    value={ofid}
                    onChange={(e) => setOfid(Number(e.target.value))}
                    className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary outline-none focus:border-accent transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Toplam Tüketim (Sm³)</label>
                <input 
                  type="number" step="0.01"
                  value={tuketimSm3}
                  onChange={(e) => setTuketimSm3(Number(e.target.value))}
                  className="w-full h-11 px-4 bg-bg border border-border-subtle rounded-xl text-sm text-text-primary outline-none focus:border-accent transition-all font-mono"
                />
              </div>
              <div className="pt-2 border-t border-border-subtle/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">
                    01. DÖNEM ({ilkTarih ? getAyAdi(new Date(ilkTarih)) : '...'}) FİYATLARI
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">1. Dönem K1 Fiyatı</label>
                    <input 
                      type="number" step="0.00000001"
                      value={p1K1Fiyat}
                      onChange={(e) => setP1K1Fiyat(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-[10px] font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">1. Dönem K2 Fiyatı</label>
                    <input 
                      type="number" step="0.00000001"
                      value={p1K2Fiyat}
                      onChange={(e) => setP1K2Fiyat(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-[10px] font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border-subtle/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">
                    02. DÖNEM ({sonTarih ? getAyAdi(new Date(sonTarih)) : '...'}) FİYATLARI
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">2. Dönem K1 Fiyatı</label>
                    <input 
                      type="number" step="0.00000001"
                      value={p2K1Fiyat}
                      onChange={(e) => setP2K1Fiyat(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-[10px] font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">2. Dönem K2 Fiyatı</label>
                    <input 
                      type="number" step="0.00000001"
                      value={p2K2Fiyat}
                      onChange={(e) => setP2K2Fiyat(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-[10px] font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border-subtle/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">EK ÖDEMELER</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Yuvarlama (TL)</label>
                    <input 
                      type="number" step="0.01"
                      value={yuvarlama}
                      onChange={(e) => setYuvarlama(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-xs font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2 block">Gecikme (TL)</label>
                    <input 
                      type="number" step="0.01"
                      value={gecikme}
                      onChange={(e) => setGecikme(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-bg border border-border-subtle rounded-xl text-xs font-mono text-text-primary outline-none focus:border-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-border-subtle/30">
                <a 
                  href="https://www.aksadogalgaz.com.tr/Musteri-Hizmetleri/Fiyat-Tarifeleri/Satis-Tarifesi" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-surface border border-border-subtle rounded-xl group hover:border-accent transition-all"
                >
                  <Info className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-[10px] text-text-secondary font-medium leading-tight group-hover:text-accent transition-colors">
                    Güncel Kademe 1 ve 2 fiyatları için <b>Aksa Doğalgaz Satış Tarifesi</b>'ne bakılabilir.
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-text-secondary/40 ml-auto group-hover:text-accent" />
                </a>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="BOTAŞ Limitleri" icon={<ArrowUpRight className="w-4 h-4" />}>
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="flex items-center justify-between py-2 border-b border-border-subtle/50">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">P1 Günlük Limit</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" step="0.0001"
                      value={botasPeriod1Limit}
                      onChange={(e) => setBotasPeriod1Limit(Number(e.target.value))}
                      className="w-20 text-right bg-transparent border-none text-sm font-mono text-accent outline-none"
                    />
                    <span className="text-[9px] font-mono text-text-secondary">Sm³</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">P2 Günlük Limit</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" step="0.0001"
                      value={botasPeriod2Limit}
                      onChange={(e) => setBotasPeriod2Limit(Number(e.target.value))}
                      className="w-20 text-right bg-transparent border-none text-sm font-mono text-accent outline-none"
                    />
                    <span className="text-[9px] font-mono text-text-secondary">Sm³</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-accent/5 rounded-lg border border-accent/10">
                <Info className="w-3 h-3 text-accent shrink-0" />
                <p className="text-[8px] text-text-secondary font-medium leading-tight">
                  Seçilen şehre göre BOTAŞ limitleri otomatik güncellenir.
                </p>
              </div>
            </div>
          </SectionCard>

          <button 
            onClick={calculate}
            className="w-full py-5 bg-text-primary hover:bg-black text-white font-bold text-xs uppercase tracking-[0.3em] rounded-2xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-accent translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <Calculator className="w-5 h-5 relative z-10 transition-transform group-hover:rotate-12" />
            <span className="relative z-10">Analizi Çalıştır</span>
          </button>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="p-5 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-start gap-3 shadow-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-semibold">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_400px] gap-8">
          <AnimatePresence mode="wait">
            {!results ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-border-subtle rounded-[2.5rem] bg-white/40"
              >
                <div className="w-20 h-20 bg-white border border-border-subtle rounded-3xl flex items-center justify-center text-text-secondary/20 mb-6 shadow-sm">
                  <Calculator className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-bold text-text-primary tracking-tight">Sistem Hazır</h3>
                <p className="text-sm text-text-secondary/60 mt-2 max-w-xs mx-auto italic">Tüm parametreleri doğruladıktan sonra hesaplama işlemini başlatın.</p>
              </motion.div>
            ) : (
              <>
                <motion.div 
                  key="main-results"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Summary Stats Row */}
                  <div className="grid grid-cols-3 gap-6">
                    <ResultStat label="Ham Tüketim" value={`${fmt(results.hamTuketim, 0)} m³`} />
                    <ResultStat label="Okuma Günü" value={`${results.okumaGunu} Gün`} />
                    <ResultStat label="Günlük Oran" value={fmt(results.gunlukSm3, 4)} mono />
                  </div>

                  {/* Period Cards */}
                  <PeriodCard period={results.period1} index={1} />
                  <PeriodCard period={results.period2} index={2} />

                  {/* Profile Visualization */}
                  <div className="bg-surface border border-border-subtle rounded-[2.5rem] p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-accent" />
                        TÜKETİM PROFİLİ (Tahmin)
                      </h4>
                      <div className="flex items-center gap-4 text-[9px] font-bold text-text-secondary uppercase tracking-widest">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent" /> Kademe 2</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-border-subtle" /> Kademe 1</div>
                      </div>
                    </div>
                    <div className="h-40 flex items-end gap-2 px-2 mb-6">
                      {[35, 45, 55, 75, 80, 95, 85, 65, 55, 60, 45, 40, 50, 65].map((h, i) => (
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: i * 0.05, duration: 0.5 }}
                          key={i} 
                          className={`flex-1 rounded-t-lg transition-transform hover:scale-x-110 cursor-pointer ${h > 70 ? 'bg-accent/80' : 'bg-border-subtle'}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-text-secondary uppercase tracking-widest border-t border-border-subtle pt-4">
                      <span>Dönem Başı</span>
                      <span className="text-text-primary">Ortalama: {fmt(results.gunlukSm3, 2)} Sm³ / Gün</span>
                      <span>Dönem Sonu</span>
                    </div>
                  </div>
                </motion.div>

                {/* Summary Box (Rightmost) */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white border-2 border-text-primary rounded-[2.5rem] p-10 flex flex-col shadow-2xl shadow-text-primary/5"
                >
                  <div className="flex items-center justify-between mb-12">
                    <h3 className="text-[14px] font-black text-text-primary uppercase tracking-[0.2em]">Fatura Özeti</h3>
                    <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white shadow-lg shadow-accent/20">
                      <Receipt className="w-5 h-5" />
                    </div>
                  </div>
                  
                  <div className="space-y-6 flex-grow">
                    <SummaryRow label={`01. Dönem (${results.period1.ayAdi})`} value={fmtCur(results.period1.tutar)} />
                    <SummaryRow label={`02. Dönem (${results.period2.ayAdi})`} value={fmtCur(results.period2.tutar)} />
                    <div className="h-px bg-border-subtle my-2" />
                    <SummaryRow label="Ara Toplam (KDV Hariç)" value={fmtCur(results.toplamKdvsiz)} />
                    <SummaryRow label="KDV (%20)" value={fmtCur(results.kdv)} />
                    
                    {yuvarlama !== 0 && <SummaryRow label="Yuvarlama Farkı" value={fmtCur(yuvarlama)} isNeg />}
                    {gecikme !== 0 && <SummaryRow label="Gecikme Bedeli" value={fmtCur(gecikme)} />}
                  </div>

                  <div className="mt-12 pt-8 border-t-2 border-dashed border-border-subtle">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em] mb-4">Ödenecek Toplam Tutar</p>
                    <div className="text-5xl font-extrabold text-text-primary tracking-tighter mb-10 leading-none">
                      {fmt(results.toplamOdeme, 2)} <span className="text-lg font-bold text-accent ml-1 italic">TL</span>
                    </div>
                    
                    <button className="w-full py-4 bg-bg border border-border-subtle hover:border-accent rounded-2xl text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-accent transition-all flex items-center justify-center gap-2 mb-6">
                      <Download className="w-4 h-4" />
                      Dekont İndir (PDF)
                    </button>

                    <div className="bg-bg rounded-2xl p-5 border border-border-subtle shadow-inner">
                      <div className="flex items-start gap-4">
                        <Info className="w-5 h-5 text-accent shrink-0" />
                        <p className="text-[10px] text-text-secondary leading-relaxed font-medium">
                          Bu analiz BOTAŞ Günlük Ağırlıklı Ortalama limitleri ve yerel dağıtım katsayıları baz alınarak yapılmıştır. Dönem geçişlerindeki kademeli tarife yapısını yansıtmaktadır.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <footer className="mt-20 pt-10 border-t border-border-subtle flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-[10px] text-text-secondary/40 font-bold uppercase tracking-[0.4em] flex items-center gap-4">
          <span>EPDK UYUMLU</span>
          <div className="w-2 h-2 rounded-full bg-accent/40" />
          <span>GASSLEDGER V3.0</span>
        </div>
        <p className="text-[10px] font-medium text-text-secondary/40">© 2026 GassLedger Analytical. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}

// --- Subcomponents ---

function SectionCard({ title, icon, children }: { title: string, icon: ReactNode, children: ReactNode }) {
  return (
    <div className="bg-white border border-border-subtle rounded-3xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6 text-accent font-bold text-[11px] uppercase tracking-widest">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultStat({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="bg-white border border-border-subtle rounded-3xl p-6 text-left shadow-sm">
      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className={`text-xl font-bold text-text-primary ${mono ? 'font-mono tracking-tighter' : ''}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, isNeg }: { label: string, value: string, isNeg?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-text-secondary font-semibold tracking-tight">{label}</span>
      <span className={`font-mono font-bold ${isNeg ? 'text-neg' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

function PeriodCard({ period, index }: { period: PeriodData, index: number }) {
  const isK1 = period.isK1;
  const accentColor = isK1 ? 'border-pos' : 'border-neg';
  const badgeColor = isK1 ? 'bg-pos/10 text-pos border-pos/20' : 'bg-neg/10 text-neg border-neg/20';

  return (
    <motion.div 
      initial={{ opacity: 0, x: -15 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className={`relative overflow-hidden bg-white border border-border-subtle border-l-8 ${accentColor} p-8 rounded-[2rem] shadow-lg shadow-black/[0.02]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h4 className="text-[11px] font-extrabold text-text-secondary uppercase tracking-[0.2em]">Dönem 0{index}: {period.ayAdi}</h4>
          <p className="text-xs text-text-secondary/60 font-semibold mt-1">{period.baslangic} – {period.bitis}</p>
        </div>
        <div className={`px-3 py-1.5 border rounded-full text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
          {isK1 ? 'Kademe 1 Aktif' : 'Kademe 2 Aktif'}
        </div>
      </div>

      <div className="text-4xl font-extrabold text-text-primary mb-8 tracking-tight">
        {fmt(period.tutar, 2)} <span className="text-lg font-bold text-text-secondary lowercase">tl</span>
      </div>

      <div className="h-px bg-border-subtle/50 mb-8" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-12">
        <MiniStat label="Süre" value={`${period.gunSayisi}`} unit="Gün" />
        <MiniStat label="Sm³ Tüketim" value={`${fmt(period.tuketimSm3, 2)}`} unit="Sm³" />
        <MiniStat label="BOTAŞ Limit" value={`${fmt(period.toplamLimitSm3, 2)}`} unit="Sm³" />
        <MiniStat label="Günlük Ort." value={`${fmt(period.gunlukOrtalama, 2)}`} unit="Sm³" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="p-3 bg-bg rounded-xl border border-border-subtle/50">
          <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest block mb-1">Enerji</span>
          <span className="text-sm font-mono font-bold text-text-primary">{fmt(period.enerjiKwh, 1)} <span className="text-[9px] text-text-secondary uppercase">kWh</span></span>
        </div>
        <div className="p-3 bg-bg rounded-xl border border-border-subtle/50">
          <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest block mb-1">Birim Fiyat</span>
          <span className="text-sm font-mono font-bold text-text-primary">{fmt(period.fiyat, 8)} <span className="text-[9px] text-text-secondary uppercase">TL</span></span>
        </div>
      </div>

      <div className="mt-10">
        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Hesaplama Mantığı
        </p>
        <div className="bg-bg rounded-2xl p-4 font-mono text-[11px] text-text-secondary font-medium leading-relaxed border border-border-subtle/50 shadow-inner">
          {period.formula}
        </div>
      </div>
    </motion.div>
  );
}


function MiniStat({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1.5">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-bold text-text-primary font-mono tracking-tighter">{value}</span>
        {unit && <span className="text-[11px] text-text-secondary font-black uppercase tracking-tighter">{unit}</span>}
      </div>
    </div>
  );
}
