
import { InvoiceItem } from "../types";

// Helper: Normalize strings for header matching (remove accents, lowercase)
const normalizeStr = (str: string) => str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, '');

// Helper: Strict Code Normalization for VALUES (Ticket Codes)
const normalizeTicketCode = (code: string): string => {
    if (!code) return '';
    // Remove all non-alphanumeric characters, uppercase
    return String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// Helper: Parse VND Amount from various formats
const parseVNDAmount = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val);
    if (!str.trim()) return 0;
    // Remove non-numeric chars except minus
    const cleanStr = str.replace(/[^0-9-]/g, '');
    return parseFloat(cleanStr) || 0;
};

// Helper: Parse Date
const parseDate = (val: any): string => {
    if (!val) return '';
    if (val instanceof Date) {
        return `${val.getDate().toString().padStart(2, '0')}/${(val.getMonth() + 1).toString().padStart(2, '0')}/${val.getFullYear()}`;
    }
    const str = String(val).trim();
    // Match DD/MM/YYYY
    const match = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) return `${match[1].padStart(2,'0')}/${match[2].padStart(2,'0')}/${match[3]}`;
    return '';
};

// Generic Function to Process a Data Matrix
const processMatrix = (data: any[][], type: 'REAL' | 'INVOICE') => {
    if (!data || data.length === 0) return new Map();

    // 1. Detect Header Row
    let headerIdx = -1;
    let colIndices = { code: -1, amount: -1, date: -1 };
    let maxScore = 0;

    const kwCode = ['mave', 'sove', 'ticket', 'code', 'id', 'ma'];
    const kwAmount = ['giatien', 'thanhtien', 'tien', 'gia', 'amount', 'revenue', 'doanhthu', 'vnd', 'total', 'tong'];
    const kwDate = ['ngay', 'date', 'thoi', 'time'];

    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (!Array.isArray(row)) continue;
        
        const rowStr = row.map(c => normalizeStr(String(c)));
        
        // Find indices
        const cIdx = rowStr.findIndex(s => kwCode.some(k => s.includes(k)));
        const aIdx = rowStr.findIndex(s => kwAmount.some(k => s.includes(k)));
        const dIdx = rowStr.findIndex(s => kwDate.some(k => s.includes(k)));

        let score = 0;
        if (cIdx !== -1) score += 3;
        if (aIdx !== -1) score += 3;
        if (dIdx !== -1) score += 1;

        if (score > maxScore) {
            maxScore = score;
            headerIdx = i;
            colIndices = { code: cIdx, amount: aIdx, date: dIdx };
        }
    }

    const map = new Map<string, { displayCode: string, amount: number, date: string, count: number }>();

    if (headerIdx === -1) return map; // No header found

    // 2. Process Rows
    for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!Array.isArray(row)) continue;

        // Extract Code
        let rawCode = '';
        if (colIndices.code !== -1 && row[colIndices.code]) {
            rawCode = String(row[colIndices.code]).trim();
        } else {
            // Fallback
            if (colIndices.code === -1) {
                 const potential = row.find(c => {
                     const s = String(c);
                     return s.length > 3 && /[A-Z]/.test(s) && /\d/.test(s);
                 });
                 if (potential) rawCode = String(potential).trim();
            }
        }

        if (!rawCode || rawCode.toLowerCase().includes('tổng') || rawCode.length < 2) continue;

        const normCode = normalizeTicketCode(rawCode);
        
        // Extract Amount
        let amount = 0;
        if (colIndices.amount !== -1) {
            amount = parseVNDAmount(row[colIndices.amount]);
        }

        // Extract Date
        let date = '';
        if (colIndices.date !== -1) {
            date = parseDate(row[colIndices.date]);
        }

        if (!map.has(normCode)) {
            map.set(normCode, {
                displayCode: rawCode,
                amount: 0,
                date: date,
                count: 0
            });
        }

        const entry = map.get(normCode)!;
        entry.amount += amount;
        entry.count += 1;
        if (!entry.date && date) entry.date = date;
    }

    return map;
};

export const reconcileVATLocal = (realData: any[][], invoiceData: any[][]): InvoiceItem[] => {
    // Ensure input is array of arrays (Matrix)
    const realMatrix = Array.isArray(realData) ? realData : [];
    const invMatrix = Array.isArray(invoiceData) ? invoiceData : [];

    const realMap = processMatrix(realMatrix, 'REAL');
    const invMap = processMatrix(invMatrix, 'INVOICE');

    const allCodes = new Set([...realMap.keys(), ...invMap.keys()]);
    const results: InvoiceItem[] = [];

    allCodes.forEach(code => {
        const realEntry = realMap.get(code);
        const invEntry = invMap.get(code);

        const realAmount = realEntry ? realEntry.amount : 0;
        const invAmount = invEntry ? invEntry.amount : 0;
        const displayCode = realEntry?.displayCode || invEntry?.displayCode || code;
        const date = realEntry?.date || invEntry?.date || '';

        // Diff Calculation
        const diff = realAmount - invAmount;
        let notes = '';
        let isVatIssued = false;

        // Logic - Simplified Status
        if (realEntry && invEntry) {
            isVatIssued = true;
            if (Math.abs(diff) > 100) { // Tolerance for floating point
                notes = 'LỆCH GIÁ';
            } else {
                notes = 'KHỚP';
            }
        } else if (realEntry && !invEntry) {
            isVatIssued = false;
            notes = 'XUẤT THIẾU';
        } else if (!realEntry && invEntry) {
            isVatIssued = true;
            notes = 'XUẤT THỪA';
        }

        results.push({
            ticketCode: displayCode,
            tripDate: date,
            realAmount: realAmount,
            invoiceAmount: invAmount,
            isVatIssued: isVatIssued,
            notes: notes
        });
    });

    // Sort: Discrepancies first, then by Code
    return results.sort((a, b) => {
        const isOkA = a.notes === 'KHỚP';
        const isOkB = b.notes === 'KHỚP';
        
        if (isOkA !== isOkB) return isOkA ? 1 : -1; // OK items go to bottom
        return a.ticketCode.localeCompare(b.ticketCode);
    });
};
