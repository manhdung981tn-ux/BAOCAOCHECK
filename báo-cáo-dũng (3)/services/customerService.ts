
import { CustomerStat } from "../types";

// Helper: Title Case a name
const toTitleCase = (str: string) => {
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

// Helper: Strict Date Parsing (DD/MM/YYYY)
const parseDate = (val: any): string => {
    if (!val) return '';
    let d = 0, m = 0, y = 0;

    // 1. JS Date
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        d = val.getDate();
        m = val.getMonth() + 1;
        y = val.getFullYear();
    } 
    // 2. String
    else if (typeof val === 'string') {
        const str = val.trim();
        const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // Start of string match
        if (match) {
            d = parseInt(match[1], 10);
            m = parseInt(match[2], 10);
            y = parseInt(match[3], 10);
        } else {
             // Try searching inside string
             const deepMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
             if (deepMatch) {
                d = parseInt(deepMatch[1], 10);
                m = parseInt(deepMatch[2], 10);
                y = parseInt(deepMatch[3], 10);
             } else {
                 return '';
             }
        }
    }
    // 3. Excel Serial
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

    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return '';
    return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
};

// Helper: Normalize for comparison
// Ensures "Đoàn Hùng Cường" and "Đoàn Hùng Cương" map to "doanhungcuong"
const normalizeForId = (str: string): string => {
    return str.toLowerCase()
        .replace(/đ/g, 'd')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""); 
};

// Helper: Aggressive Name Cleaning for Self-Exploited Drivers
const cleanSelfDriverName = (rawName: string): string => {
    // 1. Remove prefixes (Expanded list)
    // Added single letters: e, a, c followed by whitespace or punctuation
    let name = rawName.replace(/^(?:e|a|c|em|anh|chị|chú|bác|kh\s*lxe|kh\s*lái\s*xe|lái\s*xe|tài\s*xế|nhân\s*viên|nv|khách\s*lxe|kh\s*xe|mr|ms|mrs)[\s:\.\-_]+/i, "");
    
    // 2. Remove leading punctuation
    name = name.replace(/^[:\.\-_,\s]+/, "");

    // 3. Remove suffixes / extra info
    // Stop at digits, punctuation, or specific keywords like BUS, BKS, XE
    const stopRegex = /[\d\.,;:\(\)\/\\!\?\-_\n]+|\s+bus\s*|\s+bks\s*|\s+xe\s+[\d]+/i;
    const parts = name.split(stopRegex);
    
    return toTitleCase(parts[0] ? parts[0].trim() : name.trim());
};

// Main Function
export const processSelfCustomersLocal = (data: any[]): CustomerStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. Detect Header for DATE ---
    let dateColIdx = -1;
    const kwDate = ['ngày', 'date', 'thời gian'];
    
    for(let i=0; i<Math.min(data.length, 20); i++) {
        const row = data[i];
        if (Array.isArray(row)) {
             const idx = row.findIndex(c => String(c).toLowerCase().split(' ').some(w => kwDate.includes(w)));
             if (idx !== -1) {
                 dateColIdx = idx;
                 break;
             }
        }
    }

    // Map Key: "Date_NormalizedID" -> Value
    const driverMap = new Map<string, { 
        displayName: string, 
        date: string,
        count: number, 
        customers: string[], 
        notes: Set<string> 
    }>();

    // Regex for Marker: "KH LXE", "Khách Lái Xe", "Tài Xế"
    const markerRegex = /(?:KH|KHÁCH|KHACH)[\s\._\-]*(?:LX|LÁI\s*XE|LXE|LAI\s*XE|TÀI\s*XẾ|DRIVER)[\s:._\-]*/i;
    
    // Fill-down variable for Date
    let lastDate = 'Unknown';

    data.forEach((row) => {
        let rowValues: any[] = [];
        if (Array.isArray(row)) {
            rowValues = row;
        } else if (typeof row === 'object' && row !== null) {
            rowValues = Object.values(row);
        } else {
            return;
        }

        // --- Extract Date ---
        let currentDate = '';
        // Strategy A: From detected column
        if (dateColIdx !== -1 && rowValues[dateColIdx]) {
            currentDate = parseDate(rowValues[dateColIdx]);
        }
        
        // Strategy B: Scan row if no column found or cell empty
        if (!currentDate) {
            for (const cell of rowValues) {
                const p = parseDate(cell);
                if (p) {
                    currentDate = p;
                    break;
                }
            }
        }

        // Fill-Down Logic
        if (currentDate) {
            lastDate = currentDate;
        } else if (lastDate) {
            currentDate = lastDate;
        } else {
            currentDate = 'Unknown';
        }

        // --- Find Driver in Row ---
        let foundDriverInRow = false;

        for (const cellValue of rowValues) {
            if (foundDriverInRow) break; 
            if (!cellValue) continue;

            const cellStr = String(cellValue);
            
            // Check if cell contains the marker "KH LXE..."
            const matchIndex = cellStr.search(markerRegex);

            if (matchIndex !== -1) {
                const match = cellStr.match(markerRegex);
                if (match) {
                    const prefixLength = match[0].length;
                    // Extract text AFTER the marker
                    const remainder = cellStr.substring(matchIndex + prefixLength).trim();

                    if (!remainder) continue;

                    // Apply unified cleaning logic
                    const finalDriverName = cleanSelfDriverName(remainder);
                    
                    if (finalDriverName.length > 1) {
                        const driverIdNorm = normalizeForId(finalDriverName);
                        
                        // Ignore garbage results that might come from splitting numbers
                        if (driverIdNorm.length < 2) continue;

                        foundDriverInRow = true;

                        // Key includes DATE to aggregate by day + driver
                        const compositeKey = `${currentDate}_${driverIdNorm}`;

                        if (!driverMap.has(compositeKey)) {
                            driverMap.set(compositeKey, { 
                                displayName: finalDriverName, 
                                date: currentDate,
                                count: 0, 
                                customers: [], 
                                notes: new Set() 
                            });
                        }

                        const entry = driverMap.get(compositeKey)!;
                        
                        // Smart Name Update: Prefer name with accents
                        const hasAccents = /[à-ỹ]/i.test(finalDriverName);
                        const currentHasAccents = /[à-ỹ]/i.test(entry.displayName);
                        if ((hasAccents && !currentHasAccents) || 
                            (hasAccents === currentHasAccents && finalDriverName.length > entry.displayName.length)) {
                            entry.displayName = finalDriverName;
                        }

                        entry.count++;
                        entry.notes.add(cellStr);

                        // Try to find Passenger Name in other cells (heuristic)
                        let passengerName = "Khách lẻ";
                        const possibleName = rowValues.find(v => {
                            const s = String(v);
                            return s && s.length > 2 && s !== cellStr && !markerRegex.test(s) && s.length < 50 && !parseDate(s);
                        });
                        
                        if (possibleName) {
                            passengerName = String(possibleName).trim();
                        }
                        entry.customers.push(passengerName);
                    }
                }
            }
        }
    });

    const results: CustomerStat[] = [];
    driverMap.forEach((val) => {
        const finalDate = val.date === 'Unknown' ? '' : val.date;
        results.push({
            driverName: val.displayName,
            date: finalDate, 
            customerCount: val.count,
            customerNames: val.customers,
            notes: Array.from(val.notes).join('; ')
        });
    });

    // Sort by Date Desc, then Count Desc
    return results.sort((a, b) => {
        const da = a.date ? a.date.split('/').reverse().join('') : '';
        const db = b.date ? b.date.split('/').reverse().join('') : '';
        if (da !== db) return db.localeCompare(da);
        return b.customerCount - a.customerCount;
    });
};
