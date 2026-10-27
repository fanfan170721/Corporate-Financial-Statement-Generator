import type { Company } from "./types";

/** A curated discovery universe, not a market-cap ranking. Never show as a live top 30. */
export const COMPANIES: Company[] = [
  { symbol: "NVDA", name: "NVIDIA", nameEn: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Semiconductors", color: "#76b900", mark: "N", cik: "1045810" },
  { symbol: "AAPL", name: "Apple", nameEn: "Apple Inc.", exchange: "NASDAQ", sector: "Consumer technology", color: "#32343a", mark: "A", cik: "320193" },
  { symbol: "MSFT", name: "Microsoft", nameEn: "Microsoft Corporation", exchange: "NASDAQ", sector: "Software & cloud", color: "#4c94df", mark: "M", cik: "789019" },
  { symbol: "GOOGL", name: "Alphabet", nameEn: "Alphabet Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#4285f4", mark: "G", cik: "1652044" },
  { symbol: "AMZN", name: "Amazon", nameEn: "Amazon.com, Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#f0a130", mark: "a", cik: "1018724" },
  { symbol: "META", name: "Meta", nameEn: "Meta Platforms, Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#3974e7", mark: "∞", cik: "1326801" },
  { symbol: "TSLA", name: "Tesla", nameEn: "Tesla, Inc.", exchange: "NASDAQ", sector: "Energy transition", color: "#e04e60", mark: "T", cik: "1318605" },
  { symbol: "TSM", name: "TSMC", nameEn: "Taiwan Semiconductor Manufacturing Company Limited", exchange: "NYSE", sector: "Semiconductors", color: "#cd5260", mark: "T", cik: "1046179" },
  { symbol: "AVGO", name: "Broadcom", nameEn: "Broadcom Inc.", exchange: "NASDAQ", sector: "Semiconductors", color: "#ce426b", mark: "B", cik: "1730168" },
  { symbol: "AMD", name: "AMD", nameEn: "Advanced Micro Devices, Inc.", exchange: "NASDAQ", sector: "Semiconductors", color: "#313943", mark: "◩", cik: "2488" },
  { symbol: "ASML", name: "ASML", nameEn: "ASML Holding N.V.", exchange: "NASDAQ", sector: "Semiconductors", color: "#5564b8", mark: "A", cik: "937966" },
  { symbol: "NFLX", name: "Netflix", nameEn: "Netflix, Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#df3e51", mark: "N", cik: "1065280" },
  { symbol: "CRM", name: "Salesforce", nameEn: "Salesforce, Inc.", exchange: "NYSE", sector: "Software & cloud", color: "#24a1db", mark: "s", cik: "1108524" },
  { symbol: "ORCL", name: "Oracle", nameEn: "Oracle Corporation", exchange: "NYSE", sector: "Software & cloud", color: "#d86659", mark: "O", cik: "1341439" },
  { symbol: "ADBE", name: "Adobe", nameEn: "Adobe Inc.", exchange: "NASDAQ", sector: "Software & cloud", color: "#e64b57", mark: "A", cik: "796343" },
  { symbol: "PLTR", name: "Palantir", nameEn: "Palantir Technologies Inc.", exchange: "NASDAQ", sector: "Software & cloud", color: "#5a6274", mark: "P", cik: "1321655" },
  { symbol: "JPM", name: "JPMorgan Chase", nameEn: "JPMorgan Chase & Co.", exchange: "NYSE", sector: "Financial services", color: "#5f83b2", mark: "J", cik: "19617" },
  { symbol: "V", name: "Visa", nameEn: "Visa Inc.", exchange: "NYSE", sector: "Financial services", color: "#3f63af", mark: "V", cik: "1403161" },
  { symbol: "MA", name: "Mastercard", nameEn: "Mastercard Incorporated", exchange: "NYSE", sector: "Financial services", color: "#e98d54", mark: "●", cik: "1141391" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", nameEn: "Berkshire Hathaway Inc.", exchange: "NYSE", sector: "Financial services", color: "#7b7aa0", mark: "B", cik: "1067983" },
  { symbol: "LLY", name: "Eli Lilly", nameEn: "Eli Lilly and Company", exchange: "NYSE", sector: "Healthcare", color: "#d27583", mark: "L", cik: "59478" },
  { symbol: "JNJ", name: "Johnson & Johnson", nameEn: "Johnson & Johnson", exchange: "NYSE", sector: "Healthcare", color: "#d76578", mark: "J", cik: "200406" },
  { symbol: "UNH", name: "UnitedHealth", nameEn: "UnitedHealth Group Incorporated", exchange: "NYSE", sector: "Healthcare", color: "#637da6", mark: "U", cik: "731766" },
  { symbol: "NVO", name: "Novo Nordisk", nameEn: "Novo Nordisk A/S", exchange: "NYSE", sector: "Healthcare", color: "#527b9d", mark: "N", cik: "353278" },
  { symbol: "WMT", name: "Walmart", nameEn: "Walmart Inc.", exchange: "NYSE", sector: "Consumer & retail", color: "#5a9bd9", mark: "✳", cik: "104169" },
  { symbol: "COST", name: "Costco", nameEn: "Costco Wholesale Corporation", exchange: "NASDAQ", sector: "Consumer & retail", color: "#ce6573", mark: "C", cik: "909832" },
  { symbol: "KO", name: "Coca-Cola", nameEn: "The Coca-Cola Company", exchange: "NYSE", sector: "Consumer & retail", color: "#dc6b7a", mark: "C", cik: "21344" },
  { symbol: "PEP", name: "PepsiCo", nameEn: "PepsiCo, Inc.", exchange: "NASDAQ", sector: "Consumer & retail", color: "#6486c2", mark: "P", cik: "77476" },
  { symbol: "XOM", name: "ExxonMobil", nameEn: "Exxon Mobil Corporation", exchange: "NYSE", sector: "Energy", color: "#bd6570", mark: "X", cik: "34088" },
  { symbol: "GE", name: "GE Aerospace", nameEn: "General Electric Company", exchange: "NYSE", sector: "Industrials", color: "#6095be", mark: "GE", cik: "40545" },
  { symbol: "INTC", name: "Intel", nameEn: "Intel Corporation", exchange: "NASDAQ", sector: "Semiconductors", color: "#56a1ca", mark: "i", cik: "50863" },
  { symbol: "QCOM", name: "Qualcomm", nameEn: "QUALCOMM Incorporated", exchange: "NASDAQ", sector: "Semiconductors", color: "#688dc9", mark: "Q", cik: "804328" },
  { symbol: "BABA", name: "Alibaba", nameEn: "Alibaba Group Holding Limited", exchange: "NYSE", sector: "Internet & platforms", color: "#e99854", mark: "a", cik: "1577552" },
  { symbol: "PDD", name: "PDD", nameEn: "PDD Holdings Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#e16a76", mark: "P", cik: "1737806" },
  { symbol: "BIDU", name: "Baidu", nameEn: "Baidu, Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#6285d4", mark: "B", cik: "1329099" },
  { symbol: "BILI", name: "Bilibili", nameEn: "Bilibili Inc.", exchange: "NASDAQ", sector: "Internet & platforms", color: "#e397b7", mark: "b", cik: "1723690" },
  { symbol: "0700.HK", name: "Tencent", nameEn: "Tencent Holdings Limited", exchange: "HKEX", sector: "Internet & platforms", color: "#639dd3", mark: "T" },
  { symbol: "1810.HK", name: "Xiaomi", nameEn: "Xiaomi Corporation", exchange: "HKEX", sector: "Consumer technology", color: "#eaa15b", mark: "mi" },
  { symbol: "3690.HK", name: "Meituan", nameEn: "Meituan", exchange: "HKEX", sector: "Internet & platforms", color: "#d7b34c", mark: "M" },
  { symbol: "1211.HK", name: "BYD", nameEn: "BYD Company Limited", exchange: "HKEX", sector: "Energy transition", color: "#b77d98", mark: "B" },
  { symbol: "600519.SS", name: "Kweichow Moutai", nameEn: "Kweichow Moutai Co., Ltd.", exchange: "SSE", sector: "Consumer & retail", color: "#b65c69", mark: "M" },
  { symbol: "300750.SZ", name: "CATL", nameEn: "Contemporary Amperex Technology Co., Limited", exchange: "SZSE", sector: "Energy transition", color: "#648ba9", mark: "C" },
];

const ORIGINAL_NAMES: Record<string, string> = {"NVO":"诺和诺德","TSM":"台积电","COST":"开市客","TSLA":"特斯拉","BIDU":"百度","QCOM":"高通","AAPL":"苹果","GOOGL":"谷歌","KO":"可口可乐","MA":"万事达","ASML":"阿斯麦","LLY":"礼来","NVDA":"英伟达","BABA":"阿里巴巴","PDD":"拼多多","AVGO":"博通","GE":"通用电气航空","JPM":"摩根大通","ADBE":"奥多比","AMD":"超威半导体","1810.HK":"小米","WMT":"沃尔玛","AMZN":"亚马逊","PEP":"百事","3690.HK":"美团","0700.HK":"腾讯","NFLX":"奈飞","1211.HK":"比亚迪","XOM":"埃克森美孚","META":"Meta","INTC":"英特尔","300750.SZ":"宁德时代","V":"维萨","BRK-B":"伯克希尔","600519.SS":"贵州茅台","MSFT":"微软","CRM":"赛富时","UNH":"联合健康","JNJ":"强生","PLTR":"帕兰提尔","BILI":"哔哩哔哩","ORCL":"甲骨文"};

const ALIASES: Record<string, string[]> = {
  NVDA: ["nvidia", "yingweida", "英伟达", "輝達", "辉达"],
  AAPL: ["apple", "pingguo", "iphone", "苹果公司"],
  MSFT: ["microsoft", "weiruan", "azure", "微软公司"],
  GOOGL: ["google", "goog", "alphabet", "guge", "谷歌母公司"],
  AMZN: ["amazon", "yamaxun", "aws"], META: ["facebook", "脸书", "臉書", "元宇宙"],
  TSLA: ["tesila", "tesla", "特斯拉汽车"], TSM: ["tsmc", "taijidian", "台積電"],
  AMD: ["超微", "amd", "超威"], ASML: ["asml", "阿斯麥"],
  "BRK-B": ["brk.b", "berkshire", "巴菲特", "伯克希尔哈撒韦"],
  NFLX: ["netflix", "网飞", "網飛"], CRM: ["salesforce", "销售易"],
  BABA: ["alibaba", "ali", "淘宝", "天猫", "阿里"], BILI: ["bilibili", "b站", "哔哩", "嗶哩嗶哩"],
  "0700.HK": ["tencent", "tengxun", "腾讯控股", "騰訊", "700", "00700", "微信"],
  "1810.HK": ["xiaomi", "小米集团", "01810"], "3690.HK": ["meituan", "美团点评", "03690"],
  "1211.HK": ["byd", "biyadi", "比亞迪", "01211"], "600519.SS": ["maotai", "moutai", "茅台", "600519"],
  "300750.SZ": ["ningde", "catl", "宁德", "300750"],
};

export function getCompany(symbol: string): Company | undefined {
  const normalized = symbol.trim().toUpperCase().replace("BRK.B", "BRK-B");
  return COMPANIES.find((company) => company.symbol === normalized);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\-_.]/g, "");
}

/** Weighted matching covers Chinese aliases, English names, symbols and common typos. */
export function searchLocalCompanies(query: string, limit = 12): Company[] {
  const term = normalize(query);
  if (!term) return COMPANIES.slice(0, limit);
  return COMPANIES.map((company) => {
    const names = [company.symbol, company.name, company.nameEn, ORIGINAL_NAMES[company.symbol] ?? "", ...(ALIASES[company.symbol] ?? [])].map(normalize);
    const score = Math.max(...names.map((name) => name === term ? 100 : name.startsWith(term) ? 80 : name.includes(term) ? 60 : fuzzyMatch(term, name) ? 20 : 0));
    return { company, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ company }) => company);
}

function fuzzyMatch(query: string, candidate: string): boolean {
  if (query.length < 4 || /[^a-z]/.test(query)) return false;
  let index = 0;
  for (const character of candidate) if (character === query[index]) index++;
  return index === query.length;
}

/** Explainable sector similarity; does not imply investment performance or a ranking. */
export function recommendCompanies(selectedSymbols: string[], limit = 6): Company[] {
  const selected = new Set(selectedSymbols);
  const sectors = new Set(selectedSymbols.map((symbol) => getCompany(symbol)?.sector).filter(Boolean));
  return [...COMPANIES].filter((company) => !selected.has(company.symbol)).sort((a, b) => Number(sectors.has(b.sector)) - Number(sectors.has(a.sector))).slice(0, limit);
}
