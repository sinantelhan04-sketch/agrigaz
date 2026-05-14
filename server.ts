import express from "express";
import path from "path";
import cors from "cors";
import axios from "axios";
import { load } from "cheerio";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", vercel: !!process.env.VERCEL }));

// API Route for regions
app.get("/api/regions", (req, res) => {
  const regions = [
    "Aksa Doğalgaz Afyon",
    "Aksa Doğalgaz Ağrı",
    "Aksa Doğalgaz Balıkesir",
    "Aksa Doğalgaz Bandırma",
    "Aksa Doğalgaz Bilecik-Bolu",
    "Aksa Doğalgaz Bursa",
    "Aksa Doğalgaz Çanakkale",
    "Aksa Doğalgaz Çukurova",
    "Aksa Doğalgaz Düzce Ereğli",
    "Aksa Doğalgaz Elazığ",
    "Aksa Doğalgaz Gemlik",
    "Aksa Doğalgaz Gümüşhane Bayburt",
    "Aksa Doğalgaz Kayseri",
    "Aksa Doğalgaz Malatya",
    "Aksa Doğalgaz Manisa",
    "Aksa Doğalgaz Mustafakemalpaşa Susurluk Karacabey",
    "Aksa Doğalgaz Ordu Giresun",
    "Aksa Doğalgaz Siirt Batman",
    "Aksa Doğalgaz Sivas",
    "Aksa Doğalgaz Şanlıurfa",
    "Aksa Doğalgaz Sakarya",
    "Aksa Doğalgaz Tokat Amasya",
    "Aksa Doğalgaz Trabzon Rize",
    "Aksa Doğalgaz Van"
  ];
  res.json(regions);
});

// API Route for fetching prices
app.get("/api/prices", async (req, res) => {
  const { city, month, year } = req.query;
  console.log(`Processing price request for ${city}, ${month}/${year}`);
  
  const fallbackPrices = {
    k1: 6.5126,
    k2: 7.2345,
    source: "Manual/Fallback"
  };

  const citySlugs: Record<string, string> = {
    "Afyon": "Afyon",
    "Ağrı": "Agri",
    "Balıkesir": "Balikesir",
    "Bandırma": "Bandirma",
    "Bilecik-Bolu": "BilecikBolu",
    "Bursa": "Bursa",
    "Çanakkale": "Canakkale",
    "Çukurova": "Cukurova",
    "Düzce Ereğli": "DuzceEregli",
    "Elazığ": "Elazig",
    "Gemlik": "Gemlik",
    "Gümüşhane Bayburt": "GumushaneBayburt",
    "Kayseri": "Kayseri",
    "Malatya": "Malatya",
    "Manisa": "Manisa",
    "Mustafakemalpaşa Susurluk Karacabey": "MustafakemalpasaSusurlukKaracabey",
    "Ordu Giresun": "OrduGiresun",
    "Siirt Batman": "SiirtBatman",
    "Sivas": "Sivas",
    "Şanlıurfa": "Sanliurfa",
    "Sakarya": "Sakarya",
    "Tokat Amasya": "TokatAmasya",
    "Trabzon Rize": "TrabzonRize",
    "Van": "Van"
  };

  const normalizedCity = (city as string || "").replace(/^Aksa Doğalgaz\s+/i, "").trim();
  const citySlug = citySlugs[normalizedCity] || normalizedCity;
  const formattedMonth = month ? month.toString().padStart(2, '0') : '';
  const yearMonth = `${year}${formattedMonth}`;
  const baseUrl = "https://www.aksadogalgaz.com.tr/Musteri-Hizmetleri/Fiyat-Tarifeleri/Satis-Tarifesi/";

  const fetchPriceForTariff = async (tariff: string) => {
    const targetUrl = `${baseUrl}${citySlug}/${yearMonth}/${encodeURIComponent(tariff)}`;
    try {
      const response = await axios.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        timeout: 10000
      });
      const $ = load(response.data);
      let scrapedPrice = 0;

      $(":contains('Perakende Satış Tarifesi')").each((_, el) => {
        const text = $(el).text();
        if (text.includes("TL/m³")) {
          const parentText = $(el).parent().text().replace(/\s+/g, ' ');
          const globalText = $('body').text().replace(/\s+/g, ' ');
          const regex = /\d+,\d{4,}/g; 
          const matches = parentText.match(regex) || globalText.match(regex);
          if (matches && matches.length > 0) {
            scrapedPrice = parseFloat(matches[0].replace(',', '.'));
          }
        }
      });
      return scrapedPrice;
    } catch (e) {
      return 0;
    }
  };

  try {
    const [k1Price, k2Price] = await Promise.all([
      fetchPriceForTariff("ABONE TARİFESİ 1"),
      fetchPriceForTariff("ABONE TARİFESİ 2")
    ]);

    res.json({
      city,
      month,
      year,
      k1: k1Price || fallbackPrices.k1,
      k2: k2Price || fallbackPrices.k2,
      source: (k1Price > 0 || k2Price > 0) ? "Aksa Doğalgaz (Live URL)" : "Aksa Doğalgaz (Simulated/Fallback)"
    });
  } catch (error: any) {
    res.json({
      city,
      month,
      year,
      ...fallbackPrices,
      error: "Siteye erişilemedi",
      source: "GassLedger System"
    });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== "production") {
    // @ts-ignore
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
