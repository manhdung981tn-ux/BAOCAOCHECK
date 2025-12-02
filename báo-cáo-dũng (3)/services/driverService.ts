
import { DriverStat } from "../types";

// Helper: Title Case
const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

// Helper: Clean Driver Name
const cleanDriverName = (rawName: string): string => {
    // 1. Remove prefixes (Expanded list)
    // Covers: KH LXE, Khách Lái Xe, Tài Xế, NV, Driver, etc.
    let name = rawName.replace(/^(?:kh\s*lxe|kh\s*lái\s*xe|khách\s*lxe|khách\s*lái\s*xe|kh\s*xe|lái\s*xe|tài\s*xế|tên\s*lái|nhân\s*viên|nv|driver|phụ\s*xe|tiếp\s*viên|tài|mr|ms)[\s:\.\-_]*/i, "");
    
    // 2. Remove suffixes / extra info
    // We split the string at the first occurrence of:
    // - Specific separators: / (slash), - (dash), ( (open paren)
    // - Transport keywords: BUS, BKS, XE (followed by number)
    // - Digits (phone numbers, IDs)
    const stopRegex = /[\/\\\|\(\)\d]+|\s+(?:bus|bks|xe|biển)\s*[\d\w]*|\s*-\s*/i;
    
    const parts = name.split(stopRegex);
    let cleaned = parts[0] ? parts[0].trim() : name.trim();

    // Remove any trailing punctuation that might remain
    cleaned = cleaned.replace(/[\.\-_,;:]+$/, "");

    return toTitleCase(cleaned);
};

// Helper: Normalize for ID (remove accents, lowercase, keep only alphanumeric)
const normalizeForId = (str: string): string => {
    return str.toLowerCase()
        .replace(/đ/g, 'd')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""); 
};

// Helper: Parse Number
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/,/g, '');
    const match = str.match(/[-]?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
};

// Helper: Find Column Index
const findColIndex = (rowStr: string[], keywords: string[]) => {
    return rowStr.findIndex(c => keywords.some(k => c === k || c.includes(k)));
};

export const processDriverStatsLocal = (data: any[][]): DriverStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. Header Detection ---
    let bestHeaderIdx = -1;
    let maxScore = 0;
    
    let colIndices = {
        driver: -1,
        trip: -1,     // Số chuyến, lượt
        distance: -1, // Km, quãng đường
        notes: -1     // Ghi chú
    };

    const kwDriver = ['tên lái xe', 'tài xế', 'lái xe', 'họ tên', 'nhân viên', 'driver', 'khách lxe'];
    const kwTrip = ['số chuyến', 'tổng chuyến', 'lượt', 'số lượt', 'chuyến', 'trips'];
    const kwDist = ['km', 'quãng đường', 'cự ly', 'distance'];
    const kwNote = ['ghi chú', 'note', 'mô tả'];

    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c).toLowerCase());

        const dIdx = findColIndex(rowStr, kwDriver);
        const tIdx = findColIndex(rowStr, kwTrip);
        const distIdx = findColIndex(rowStr, kwDist);
        const nIdx = findColIndex(rowStr, kwNote);

        let score = 0;
        if (dIdx !== -1) score += 3;
        if (tIdx !== -1) score += 2;
        if (distIdx !== -1) score += 1;
        
        if (dIdx !== -1 && score > maxScore) {
            maxScore = score;
            bestHeaderIdx = i;
            colIndices = { driver: dIdx, trip: tIdx, distance: distIdx, notes: nIdx };
        }
    }

    if (bestHeaderIdx === -1) return [];

    // --- 2. Process Rows ---
    const map = new Map<string, DriverStat>();

    for (let i = bestHeaderIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const rawDriver = colIndices.driver !== -1 ? String(row[colIndices.driver]).trim() : '';
        if (!rawDriver) continue;

        // Skip summary rows
        if (rawDriver.toLowerCase().includes('tổng') || rawDriver.toLowerCase().includes('cộng')) continue;

        const driverName = cleanDriverName(rawDriver);
        if (driverName.length < 2) continue;

        // Use Normalized ID for aggregation
        const id = normalizeForId(driverName);

        if (!map.has(id)) {
            map.set(id, {
                driverName: driverName,
                tripCount: 0,
                totalDistance: '', 
                notes: ''
            });
        }

        const entry = map.get(id)!;

        // Smart Display Name Update
        // Prefer name with accents or longer name if accents match
        const hasAccents = /[à-ỹ]/i.test(driverName);
        const currentHasAccents = /[à-ỹ]/i.test(entry.driverName);
        if ((hasAccents && !currentHasAccents) || 
            (hasAccents === currentHasAccents && driverName.length > entry.driverName.length)) {
            entry.driverName = driverName;
        }

        // Count Trips
        let trips = 0;
        if (colIndices.trip !== -1) {
            // If explicit column exists, sum the value
            trips = parseNumber(row[colIndices.trip]);
        } else {
            // If no trip column, count the row as 1 trip
            trips = 1;
        }
        entry.tripCount += trips;

        // Notes (Concatenate unique notes)
        if (colIndices.notes !== -1 && row[colIndices.notes]) {
            const n = String(row[colIndices.notes]).trim();
            if (n && !entry.notes?.includes(n)) {
                entry.notes = entry.notes ? `${entry.notes}; ${n}` : n;
            }
        }

        // Distance
        if (colIndices.distance !== -1 && row[colIndices.distance]) {
            const distVal = row[colIndices.distance];
            if (typeof distVal === 'number') {
                const currentDist = parseFloat(entry.totalDistance || '0');
                entry.totalDistance = (currentDist + distVal).toFixed(1);
            } else {
                entry.totalDistance = String(distVal);
            }
        }
    }

    // --- 3. Finalize ---
    return Array.from(map.values()).sort((a, b) => b.tripCount - a.tripCount);
};
