
import { CustomerStat } from "../types";

// Helper: Title Case
const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

// Helper: Strict Date Parsing (DD/MM/YYYY only)
const parseDate = (val: any): string => {
    if (!val) return '';
    
    let d = 0, m = 0, y = 0;

    // 1. Handle JS Date Object (Standard from xlsx with cellDates: true)
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return ''; // Invalid date object
        d = val.getDate();
        m = val.getMonth() + 1;
        y = val.getFullYear();
    } 
    // 2. Handle Strings (STRICT DD/MM/YYYY)
    else if (typeof val === 'string') {
        const str = val.trim();
        // Strict Regex: 1-2 digits / 1-2 digits / 4 digits
        const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        
        if (match) {
            d = parseInt(match[1], 10);
            m = parseInt(match[2], 10);
            y = parseInt(match[3], 10);
        } else {
            return ''; 
        }
    }
    // 3. Handle Excel Serial Numbers (Numbers > 20000)
    else if (typeof val === 'number') {
        if (val > 20000 && val < 60000) {
            const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
            d = dateObj.getUTCDate();
            m = dateObj.getUTCMonth() + 1;
            y = dateObj.getUTCFullYear();
        } else {
            return ''; 
        }
    } else {
        return '';
    }

    // --- LOGICAL VALIDATION ---
    if (m < 1 || m > 12) return '';
    if (d < 1 || d > 31) return '';
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d > daysInMonth) return '';
    if (y < 2000 || y > 2100) return '';

    return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
};

// Helper: Safely parse a number from a cell that might contain text (e.g. "5 vé" -> 5)
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/,/g, '');
    const match = str.match(/[-]?\d+(\.\d+)?/); // Extract first number
    return match ? parseFloat(match[0]) : 0;
};

// Helper: Determine if a value represents a unique trip (Time, Code, etc.)
const getTripKey = (row: any[], indices: { tripIdx: number, timeIdx: number }): string => {
    let key = '';
    // Priority 1: Trip Code (Mã chuyến, Lượt, MS, Chuyến)
    if (indices.tripIdx !== -1 && row[indices.tripIdx]) {
        key += String(row[indices.tripIdx]).trim();
    }
    // Priority 2: Time (Giờ)
    if (indices.timeIdx !== -1 && row[indices.timeIdx]) {
        if (key) key += '_';
        const timeVal = row[indices.timeIdx];
        if (typeof timeVal === 'number' && timeVal < 1) {
             // Convert fraction to HH:MM
             const totalMin = Math.round(timeVal * 24 * 60);
             key += totalMin; 
        } else {
             key += String(timeVal).trim();
        }
    }
    return key;
};

// Helper: Find index of a column matching specific keywords
const findColIndex = (rowStr: string[], highPriorityKw: string[], lowPriorityKw: string[] = []) => {
    let idx = rowStr.findIndex(c => highPriorityKw.some(k => c === k || c.includes(k))); // Strict checks first
    if (idx === -1 && lowPriorityKw.length > 0) {
        idx = rowStr.findIndex(c => lowPriorityKw.some(k => c.includes(k)));
    }
    return idx;
};

// Helper: Normalize for ID
// Converts "Đoàn Hùng Cường" -> "doanhungcuong"
// Converts "Đoàn Hùng Cương" -> "doanhungcuong"
const normalizeForId = (str: string): string => {
    return str.toLowerCase()
        .replace(/đ/g, 'd')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""); 
};

// Helper: Clean Driver Name
const cleanDriverName = (rawName: string): string => {
    // 1. Remove prefixes
    // Added: e, a, c, em, anh, chi, chú, bác... (followed by space or punctuation)
    let name = rawName.replace(/^(?:e|a|c|em|anh|chị|chú|bác|kh\s*lxe|kh\s*lái\s*xe|lái\s*xe|tài\s*xế|nhân\s*viên|nv|khách\s*lxe|kh\s*xe)[\s:\.\-_]+/i, "");
    
    // 2. Remove suffixes / extra info
    const stopRegex = /[\d\.,;:\(\)\/\\!\?\-_\n]+|\s+bus\s*|\s+bks\s*|\s+xe\s+[\d]+/i;
    const parts = name.split(stopRegex);
    
    return parts[0] ? parts[0].trim() : name.trim();
};

export const processDailyCustomersLocal = (data: any[][]): CustomerStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. SMART HEADER DETECTION ---
    let bestHeaderIdx = -1;
    let maxScore = 0;
    
    let bestColIndices = {
        driver: -1,
        date: -1,
        customer: -1, 
        ticket: -1,   
        trip: -1,     
        time: -1      
    };

    // Keyword Dictionaries
    const kwDriverHigh = ['tên lái xe', 'tài xế', 'lái xe', 'họ tên lái xe'];
    const kwDriverLow = ['driver', 'nhân viên', 'bác tài', 'tên lái'];
    
    const kwDateHigh = ['ngày đi', 'ngày xuất bến'];
    const kwDateLow = ['ngày', 'date', 'thời gian', 'ngày tháng'];
    
    // Customer Count (Pax)
    const kwCustHigh = ['tổng vé', 'số lượng khách', 'sl khách', 'tổng số khách'];
    const kwCustLow = ['khách', 'số lượng', 'sl', 'pax', 'người'];
    
    // Ticket Count (Quantity)
    const kwTicketHigh = ['số vé', 'sl vé', 'lượng vé', 'vé bán', 'vé'];
    const kwTicketLow = ['ticket'];
    
    // Trip (Lượt/Chuyến)
    const kwTripHigh = ['chuyến', 'mã chuyến', 'lượt', 'ms'];
    const kwTripLow = ['nốt', 'tài'];

    const kwTime = ['giờ', 'time', 'xuất bến'];

    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;

        const rowStr = row.map(c => String(c).toLowerCase());
        
        // Detect Columns
        const driverIdx = findColIndex(rowStr, kwDriverHigh, kwDriverLow);
        const dateIdx = findColIndex(rowStr, kwDateHigh, kwDateLow);
        
        // Find Customer column
        const customerIdx = rowStr.findIndex(c => 
            (kwCustHigh.some(k => c.includes(k))) || 
            (kwCustLow.some(k => c.includes(k)) && !c.includes('loại'))
        );

        // Find Ticket column (Exclude 'mã vé' if looking for quantity)
        const ticketIdx = rowStr.findIndex(c => 
            (kwTicketHigh.some(k => c.includes(k))) || 
            (kwTicketLow.some(k => c.includes(k)) && !c.includes('mã'))
        );

        const tripIdx = findColIndex(rowStr, kwTripHigh, kwTripLow);
        const timeIdx = findColIndex(rowStr, kwTime, []);

        let currentScore = 0;
        if (driverIdx !== -1) currentScore += 3;
        if (dateIdx !== -1) currentScore += 2; // Boost Date priority
        if (customerIdx !== -1) currentScore += 2;
        if (ticketIdx !== -1) currentScore += 1;
        if (tripIdx !== -1 || timeIdx !== -1) currentScore += 1;

        if (driverIdx !== -1 && currentScore > maxScore) {
            maxScore = currentScore;
            bestHeaderIdx = i;
            bestColIndices = { 
                driver: driverIdx, 
                date: dateIdx, 
                customer: customerIdx, 
                ticket: ticketIdx, 
                trip: tripIdx, 
                time: timeIdx 
            };
        }
    }

    if (bestHeaderIdx === -1) {
        return [];
    }

    // --- 2. Process Data Rows ---
    const map = new Map<string, {
        driverName: string;
        date: string;
        totalCustomers: number;
        totalTickets: number;
        trips: Set<string>; 
        rowTrips: number; 
        customerNames: string[];
    }>();

    for (let i = bestHeaderIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Extract Driver
        let rawDriverName = bestColIndices.driver !== -1 ? String(row[bestColIndices.driver]).trim() : '';
        if (!rawDriverName) continue;
        
        // Filter Summary rows
        const lowerRawName = rawDriverName.toLowerCase();
        if (lowerRawName.includes('tổng') || lowerRawName.includes('cộng') || lowerRawName.includes('total')) continue;
        
        // Clean Driver Name
        const cleanedName = cleanDriverName(rawDriverName);
        if (cleanedName.length < 2) continue; 

        const driverId = normalizeForId(cleanedName);
        const displayName = toTitleCase(cleanedName);

        // Extract Date (Strict)
        let dateStr = 'Unknown';
        if (bestColIndices.date !== -1) {
            dateStr = parseDate(row[bestColIndices.date]);
        }
        if (!dateStr) dateStr = 'Unknown'; 

        const id = `${dateStr}_${driverId}`;

        if (!map.has(id)) {
            map.set(id, {
                driverName: displayName,
                date: dateStr,
                totalCustomers: 0,
                totalTickets: 0,
                trips: new Set(),
                rowTrips: 0,
                customerNames: []
            });
        }

        const entry = map.get(id)!;

        // Name Update Heuristic: Prefer Accents
        const hasAccents = /[à-ỹ]/i.test(displayName);
        const currentHasAccents = /[à-ỹ]/i.test(entry.driverName);
        
        // If current name in map is simple "Doan Hung Cuong" but new name is "Đoàn Hùng Cường", update it.
        // Also if lengths differ significantly but ID matched, prefer the longer/more detailed one.
        if ((hasAccents && !currentHasAccents) || 
            (hasAccents === currentHasAccents && displayName.length > entry.driverName.length)) {
            entry.driverName = displayName;
        }

        // Count Customers
        let custCount = 0;
        if (bestColIndices.customer !== -1) {
            custCount = parseNumber(row[bestColIndices.customer]);
        } else {
            // Default 1 if no column
            custCount = 1; 
        }
        entry.totalCustomers += custCount;

        // Count Tickets
        let ticketCount = 0;
        if (bestColIndices.ticket !== -1 && bestColIndices.ticket !== bestColIndices.customer) {
             ticketCount = parseNumber(row[bestColIndices.ticket]);
        } else {
            ticketCount = custCount;
        }
        entry.totalTickets += ticketCount;

        // Count Trips
        const tripKey = getTripKey(row, { tripIdx: bestColIndices.trip, timeIdx: bestColIndices.time });
        if (tripKey) {
            entry.trips.add(tripKey);
        } else {
            entry.rowTrips += 1;
        }
    }

    // --- 3. Finalize ---
    const results: CustomerStat[] = [];
    map.forEach(val => {
        const tripCount = val.trips.size > 0 ? val.trips.size : val.rowTrips;
        const finalDate = val.date === 'Unknown' ? '' : val.date;

        results.push({
            driverName: val.driverName,
            date: finalDate,
            customerCount: val.totalCustomers,
            ticketCount: val.totalTickets,
            tripCount: tripCount,
            customerNames: [], 
            notes: ''
        });
    });

    return results.sort((a, b) => {
        const da = a.date ? a.date.split('/').reverse().join('') : '';
        const db = b.date ? b.date.split('/').reverse().join('') : '';
        if (da !== db) return db.localeCompare(da);
        return a.driverName.localeCompare(b.driverName);
    });
};
