
import { PhoneStat } from "../types";

// Helper: Normalize Phone Number
// Converts various formats (0912.345.678, +84912345678, 84912345678) to standard 0xxxxxxxxx
const normalizePhone = (raw: string): string => {
    // Remove non-digits
    let digits = raw.replace(/\D/g, '');
    
    // Handle 84 prefix
    if (digits.startsWith('84')) {
        digits = '0' + digits.substring(2);
    }
    
    // Basic validation for Vietnam mobile (10 digits) or landline (11 digits)
    // If it's suspiciously short or long, it might not be a phone number
    if (digits.length < 9 || digits.length > 11) return '';
    
    return digits;
};

// Helper: Title Case Name
const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

// Helper: Find Column Index
const findColIndex = (rowStr: string[], keywords: string[]) => {
    return rowStr.findIndex(c => keywords.some(k => c.includes(k)));
};

export const processPhoneStatsLocal = (data: any[][]): PhoneStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. Header Detection ---
    let bestHeaderIdx = -1;
    let maxScore = 0;
    
    let colIndices = {
        phone: -1,
        name: -1,
        date: -1,
        qty: -1,
        route: -1 // New column for Route
    };

    const kwPhone = ['số điện thoại', 'sđt', 'điện thoại', 'mobile', 'phone', 'tel', 'hotline'];
    const kwName = ['tên khách', 'họ tên', 'người gửi', 'khách hàng', 'name', 'customer'];
    const kwDate = ['ngày', 'date', 'thời gian'];
    const kwQty = ['số lượng', 'sl', 'số vé'];
    const kwRoute = ['tuyến', 'lộ trình', 'hành trình', 'route', 'chặng']; // Keywords for Route

    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c).toLowerCase());

        const pIdx = findColIndex(rowStr, kwPhone);
        const nIdx = findColIndex(rowStr, kwName);
        const dIdx = findColIndex(rowStr, kwDate);
        const qIdx = findColIndex(rowStr, kwQty);
        const rIdx = findColIndex(rowStr, kwRoute);

        let score = 0;
        if (pIdx !== -1) score += 3;
        if (nIdx !== -1) score += 2;
        if (dIdx !== -1) score += 1;
        if (rIdx !== -1) score += 1;
        
        if (pIdx !== -1 && score > maxScore) {
            maxScore = score;
            bestHeaderIdx = i;
            colIndices = { phone: pIdx, name: nIdx, date: dIdx, qty: qIdx, route: rIdx };
        }
    }

    if (bestHeaderIdx === -1) return [];

    // --- 2. Process Data ---
    const map = new Map<string, PhoneStat>();

    for (let i = bestHeaderIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const rawPhone = colIndices.phone !== -1 ? String(row[colIndices.phone]).trim() : '';
        if (!rawPhone) continue;

        // Try to extract phone numbers even if mixed with text
        // Regex to find 9-11 consecutive digits, possibly starting with 0 or 84
        const phoneMatch = rawPhone.match(/(?:84|0[3|5|7|8|9])+([0-9]{8})\b/) || rawPhone.match(/\d{9,11}/);
        
        let validPhone = '';
        if (phoneMatch) {
            validPhone = normalizePhone(phoneMatch[0]);
        }
        
        if (!validPhone) continue;

        if (!map.has(validPhone)) {
            map.set(validPhone, {
                phoneNumber: validPhone,
                customerName: '',
                tripCount: 0,
                lastDate: '',
                notes: '',
                routes: [] // Initialize routes
            });
        }

        const entry = map.get(validPhone)!;

        // Extract Name
        if (colIndices.name !== -1 && row[colIndices.name]) {
            const rawName = String(row[colIndices.name]).trim();
            if (rawName) {
                const clean = toTitleCase(rawName);
                if (!entry.customerName || clean.length > entry.customerName.length) {
                    entry.customerName = clean;
                }
            }
        }

        // Count (Quantity)
        let count = 1;
        if (colIndices.qty !== -1) {
            const qVal = parseFloat(String(row[colIndices.qty]).replace(/,/g, ''));
            if (!isNaN(qVal) && qVal > 0) count = qVal;
        }
        entry.tripCount += count;

        // Date (Keep most recent)
        if (colIndices.date !== -1 && row[colIndices.date]) {
             entry.lastDate = String(row[colIndices.date]); 
        }

        // Extract Route
        if (colIndices.route !== -1 && row[colIndices.route]) {
            const rVal = String(row[colIndices.route]).trim();
            if (rVal && !entry.routes.includes(rVal)) {
                entry.routes.push(rVal);
            }
        }
    }

    // --- 3. Finalize ---
    // Sort by Trip Count Descending
    return Array.from(map.values()).sort((a, b) => b.tripCount - a.tripCount);
};
