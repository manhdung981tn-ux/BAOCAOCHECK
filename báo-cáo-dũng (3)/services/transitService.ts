
import { TransitStat } from "../types";

// Helper: Title Case
const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

// Helper: Strict Date Parsing (DD/MM/YYYY)
const parseDate = (val: any): string => {
    if (!val) return '';
    let d = 0, m = 0, y = 0;

    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        d = val.getDate();
        m = val.getMonth() + 1;
        y = val.getFullYear();
    } else if (typeof val === 'string') {
        // Look for DD/MM/YYYY pattern anywhere in the string
        const match = val.trim().match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            d = parseInt(match[1], 10);
            m = parseInt(match[2], 10);
            y = parseInt(match[3], 10);
        } else return '';
    } else if (typeof val === 'number') {
        if (val > 20000 && val < 60000) {
            const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
            d = dateObj.getUTCDate();
            m = dateObj.getUTCMonth() + 1;
            y = dateObj.getUTCFullYear();
        } else return '';
    } else return '';

    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return '';
    return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
};

// Helper: Parse Number (Smart extraction)
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/,/g, '');
    // Match the first significant number found (e.g. "5 pax" -> 5)
    const match = str.match(/[-]?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
};

// Helper: Clean Transit Driver Name
const cleanTransitName = (rawName: string): string => {
    // Remove prefixes/titles
    // Added 'tài trung chuyển', 'tài tc' specifically
    let name = rawName.replace(/^(?:tài\s*trung\s*chuyển|tài\s*tc|lx\s*trung\s*chuyển|lái\s*xe\s*tc|lx\s*tc|tài\s*xế\s*tc|xe\s*tc|trung\s*chuyển|lái\s*xe|tài\s*xế|nhân\s*viên|nv|mr|ms|anh|chị|em)[\s:\.\-_]*/i, "");
    
    // Remove trailing BKS or Phone info
    // Stop at digits, punctuation, or "BKS", "Xe"
    const stopRegex = /[\d\.,;:\(\)\/\\!\?\-_\n]+|\s+bks\s*|\s+xe\s+/i;
    const parts = name.split(stopRegex);
    
    return toTitleCase(parts[0] ? parts[0].trim() : name.trim());
};

// Helper: Clean and Validate License Plate
const extractLicensePlate = (raw: string): string => {
    if (!raw) return '';
    const str = String(raw).toUpperCase();

    // Specific Regex for Vietnamese Plates: 
    // 29B-12345, 29B 123.45, 29B12345, 29LD-xxx
    // Group 1: Region code + Series (e.g. 29B, 30F, 29LD)
    // Group 2: Numbers
    const plateRegex = /\b(\d{2}[A-Z]{1,2})[\s\.\-]*(\d{3,4}\.?\d{0,2})\b/;
    
    const match = str.match(plateRegex);
    
    if (match) {
        const prefix = match[1];
        const suffix = match[2].replace(/[\.\s]/g, '');
        // Standardize to 29B-12345
        return `${prefix}-${suffix}`;
    }
    
    // Fallback: simple check if it looks like a plate provided in a specific column
    if (str.length < 15 && /\d/.test(str) && /[A-Z]/.test(str) && !str.includes(' ')) {
         return str.replace(/[\.\s]/g, '');
    }

    return '';
};

// Helper: Find Column Index
const findColIndex = (rowStr: string[], keywords: string[]) => {
    return rowStr.findIndex(c => keywords.some(k => c === k || c.includes(k)));
};

export const processTransitStatsLocal = (data: any[][]): TransitStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. Header Detection ---
    let bestHeaderIdx = -1;
    let maxScore = 0;
    
    let colIndices = {
        driver: -1,
        date: -1,
        qty: -1,
        plate: -1,
        note: -1
    };

    // Extended Keywords for better detection
    // Prioritized 'tài trung chuyển'
    const kwDriver = ['tài trung chuyển', 'lái xe trung chuyển', 'tài tc', 'lái xe', 'tài xế', 'họ tên', 'tên', 'nhân viên', 'người lái', 'driver', 'name'];
    const kwDate = ['ngày', 'date', 'thời gian'];
    const kwQty = ['số khách', 'số lượng', 'sl', 'pax', 'người', 'số người', 'khách'];
    const kwPlate = ['bks', 'biển', 'số xe', 'kiểm soát', 'plate'];
    const kwNote = ['ghi chú', 'lộ trình', 'tuyến', 'nội dung', 'note'];

    for (let i = 0; i < Math.min(data.length, 30); i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c).toLowerCase());

        const dIdx = findColIndex(rowStr, kwDriver);
        const dateIdx = findColIndex(rowStr, kwDate);
        const qIdx = findColIndex(rowStr, kwQty);
        const pIdx = findColIndex(rowStr, kwPlate);
        const nIdx = findColIndex(rowStr, kwNote);

        let score = 0;
        if (dIdx !== -1) score += 3;
        if (dateIdx !== -1) score += 3;
        if (qIdx !== -1) score += 2; 
        if (pIdx !== -1) score += 2; 
        
        if (score > maxScore) { 
            maxScore = score;
            bestHeaderIdx = i;
            colIndices = { driver: dIdx, date: dateIdx, qty: qIdx, plate: pIdx, note: nIdx };
        }
    }

    if (bestHeaderIdx === -1) return [];

    // --- 2. Process Data ---
    const map = new Map<string, {
        driverName: string,
        date: string,
        totalPax: number,
        tripCount: number,
        plates: Set<string>,
        notes: Set<string>
    }>();

    // Fill-down variables
    let lastDriverName = '';
    let lastDate = 'Unknown';

    for (let i = bestHeaderIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const rowStringFull = row.join(' ').toLowerCase();

        // Skip Summary/Noise Rows
        if (rowStringFull.includes('tổng') || rowStringFull.includes('cộng') || rowStringFull.includes('ký tên')) continue;
        if (row.every(c => !c)) continue; // Skip empty rows

        // --- 1. DRIVER NAME (Column Mapped + Fill Down) ---
        let driverName = '';
        if (colIndices.driver !== -1 && row[colIndices.driver]) {
            const raw = String(row[colIndices.driver]).trim();
            if (raw) driverName = cleanTransitName(raw);
        }
        
        // Logic: Update fill-down source if we found a new valid name
        if (driverName) {
            lastDriverName = driverName;
        } else if (lastDriverName) {
            // Only fill down if there is other data (like pax or plate) in this row
            const hasData = row.some(c => c && String(c).trim().length > 0);
            if (hasData) {
                driverName = lastDriverName;
            }
        }

        if (!driverName || driverName.length < 2) continue; 

        // --- 2. DATE (Column Mapped + Pattern Scan + Fill Down) ---
        let dateStr = '';
        
        // Strategy A: Mapped Column
        if (colIndices.date !== -1 && row[colIndices.date]) {
            const parsed = parseDate(row[colIndices.date]);
            if (parsed) dateStr = parsed;
        }

        // Strategy B: Scan entire row for Date pattern if missing
        if (!dateStr) {
            for (const cell of row) {
                const parsed = parseDate(cell);
                if (parsed) {
                    dateStr = parsed;
                    break;
                }
            }
        }

        // Logic: Update fill-down source
        if (dateStr) {
            lastDate = dateStr;
        } else if (lastDate) {
            dateStr = lastDate;
        }

        if (!dateStr) dateStr = 'Unknown';

        const id = `${dateStr}_${driverName.toLowerCase()}`;

        if (!map.has(id)) {
            map.set(id, {
                driverName: driverName,
                date: dateStr,
                totalPax: 0,
                tripCount: 0,
                plates: new Set(),
                notes: new Set()
            });
        }

        const entry = map.get(id)!;

        // --- 3. PASSENGER COUNT (Column Mapped + Pattern Scan) ---
        let pax = 0;
        
        // Strategy A: Mapped Column
        if (colIndices.qty !== -1 && row[colIndices.qty]) {
            pax = parseNumber(row[colIndices.qty]);
        }
        
        // Strategy B: If 0, scan row for numbers near keywords "khách", "pax"
        if (pax === 0) {
             const paxMatch = rowStringFull.match(/(\d+)\s*(?:khách|pax|người)/);
             if (paxMatch) {
                 pax = parseInt(paxMatch[1]);
             } else {
                 // Strategy C: If strictly NO number found, assume 1 trip = 1 pax minimum?
                 // Let's safe default to 1 if we are sure this is a trip row (has driver)
                 pax = 1; 
             }
        }
        
        entry.totalPax += pax;
        entry.tripCount += 1;

        // --- 4. LICENSE PLATE (Column Mapped + Pattern Scan) ---
        let plateFound = '';
        
        // Strategy A: Mapped Column
        if (colIndices.plate !== -1 && row[colIndices.plate]) {
            plateFound = extractLicensePlate(String(row[colIndices.plate]));
        }
        
        // Strategy B: Scan entire row for Plate pattern
        if (!plateFound) {
            for (const cell of row) {
                if (cell) {
                    const extracted = extractLicensePlate(String(cell));
                    if (extracted) {
                        plateFound = extracted;
                        break;
                    }
                }
            }
        }

        if (plateFound) entry.plates.add(plateFound);

        // --- 5. NOTES ---
        if (colIndices.note !== -1 && row[colIndices.note]) {
            const n = String(row[colIndices.note]).trim();
            if (n) entry.notes.add(n);
        }
    }

    // --- 3. Finalize ---
    const results: TransitStat[] = [];
    map.forEach(val => {
        const finalDate = val.date === 'Unknown' ? '' : val.date;
        results.push({
            driverName: val.driverName,
            date: finalDate,
            passengerCount: val.totalPax,
            tripCount: val.tripCount,
            licensePlate: Array.from(val.plates).join(', '),
            notes: Array.from(val.notes).join('; ')
        });
    });

    // Sort by Date Desc, then Driver
    return results.sort((a, b) => {
        const da = a.date.split('/').reverse().join('');
        const db = b.date.split('/').reverse().join('');
        if (da !== db) return db.localeCompare(da);
        return a.driverName.localeCompare(b.driverName);
    });
};
