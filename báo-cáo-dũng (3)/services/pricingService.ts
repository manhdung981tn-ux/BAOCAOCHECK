
import { PricingStat } from "../types";

// Helper: Normalize Route Name
const normalizeRoute = (str: string) => {
    if (!str) return 'Chưa xác định';
    return str.trim().replace(/\s+/g, ' ');
};

// Helper: Determine Route Group (Bidirectional Merging)
const getRouteGroup = (route: string): string => {
    const lower = route.toLowerCase();
    
    // Group 1: Thai Nguyen <=> My Dinh
    if ((lower.includes('thái nguyên') || lower.includes('tn')) && (lower.includes('mỹ đình') || lower.includes('mđ'))) {
        return 'Tuyến Thái Nguyên <=> Mỹ Đình';
    }
    
    // Group 2: Thai Nguyen <=> Bac Kan
    if ((lower.includes('thái nguyên') || lower.includes('tn')) && (lower.includes('bắc kạn') || lower.includes('bk'))) {
        return 'Tuyến Thái Nguyên <=> Bắc Kạn';
    }

    return route; // Default: Keep original name
};

// Helper: Classify Ticket Type based on Price and Route Group
const classifyTicket = (price: number, routeGroup: string): string => {
    // Specific Rules for Thai Nguyen <=> My Dinh
    if (routeGroup === 'Tuyến Thái Nguyên <=> Mỹ Đình') {
        if (price === 100000) return 'Khách sử dụng trung chuyển (Taxi/Bus)';
        // 90k is Student with Transit
        if (price === 90000) return 'Vé Sinh Viên (Kèm Trung Chuyển)'; 
        // 70k is Regular Student
        if (price === 70000) return 'Vé Sinh Viên (Thường)'; 
    }

    // General Rules (Apply to all other routes or prices not caught above)
    // Fallback if route name detection fails but price matches standard student prices
    if (price === 90000 || price === 70000) return 'Vé Sinh Viên';
    
    return 'Vé Thường';
};

// Helper: Parse Number
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    return parseFloat(str) || 0;
};

// Helper: Find Column Index
const findColIndex = (rowStr: string[], keywords: string[]) => {
    return rowStr.findIndex(c => keywords.some(k => c === k || c.includes(k)));
};

export const processPricingStatsLocal = (data: any[][]): PricingStat[] => {
    if (!data || data.length === 0) return [];

    // --- 1. Header Detection ---
    let bestHeaderIdx = -1;
    let maxScore = 0;
    
    let colIndices = {
        route: -1,
        price: -1,
        qty: -1
    };

    const kwRoute = ['tuyến', 'lộ trình', 'hành trình', 'chặng', 'route', 'tên tuyến'];
    const kwPrice = ['giá vé', 'đơn giá', 'price', 'tiền vé', 'thành tiền', 'doanh thu']; 
    const kwQty = ['số lượng', 'sl', 'số vé', 'khách'];

    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c).toLowerCase());

        const rIdx = findColIndex(rowStr, kwRoute);
        const pIdx = findColIndex(rowStr, kwPrice);
        const qIdx = findColIndex(rowStr, kwQty);

        let score = 0;
        if (rIdx !== -1) score += 3;
        if (pIdx !== -1) score += 3;
        if (qIdx !== -1) score += 2;
        
        if (score > maxScore) {
            maxScore = score;
            bestHeaderIdx = i;
            colIndices = { route: rIdx, price: pIdx, qty: qIdx };
        }
    }

    if (bestHeaderIdx === -1) return [];

    // --- 2. Process Rows ---
    // Map Key: "RouteGroup_Price_Type"
    const map = new Map<string, PricingStat>();

    // Fill-down for route
    let lastRoute = '';

    for (let i = bestHeaderIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Extract Route
        let routeName = '';
        if (colIndices.route !== -1 && row[colIndices.route]) {
            routeName = normalizeRoute(String(row[colIndices.route]));
        }
        
        if (routeName) {
            lastRoute = routeName;
        } else if (lastRoute) {
            routeName = lastRoute; // Fill down
        } else {
            routeName = 'Tuyến Khác';
        }

        // Extract Price
        let price = 0;
        if (colIndices.price !== -1) {
            price = parseNumber(row[colIndices.price]);
        }

        // Extract Quantity
        let quantity = 1;
        if (colIndices.qty !== -1) {
            const q = parseNumber(row[colIndices.qty]);
            if (q > 0) quantity = q;
        }

        // FILTER: Only accept prices > 0 and <= 150,000 VND
        if (price === 0 || price > 150000) continue;

        // Determine Group & Classification
        const routeGroup = getRouteGroup(routeName);
        const ticketType = classifyTicket(price, routeGroup);

        // Key: RouteGroup + Price + Type
        const key = `${routeGroup}_${price}_${ticketType}`;

        if (!map.has(key)) {
            map.set(key, {
                route: routeName, // Keep original route name for reference if needed (or use group)
                routeGroup: routeGroup,
                price: price,
                ticketType: ticketType,
                quantity: 0,
                totalRevenue: 0
            });
        }

        const entry = map.get(key)!;
        entry.quantity += quantity;
        entry.totalRevenue += (price * quantity);
    }

    // --- 3. Finalize ---
    // Sort by Route Group, then Price Desc
    return Array.from(map.values()).sort((a, b) => {
        if (a.routeGroup !== b.routeGroup) return a.routeGroup.localeCompare(b.routeGroup);
        return b.price - a.price;
    });
};
