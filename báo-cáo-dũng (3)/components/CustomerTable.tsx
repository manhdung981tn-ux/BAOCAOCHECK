
import React, { useState, useMemo } from 'react';
import { CustomerStat } from '../types';
import { utils, writeFile } from 'xlsx';

interface CustomerTableProps {
  data: CustomerStat[];
  title?: string;
  colorTheme?: 'green' | 'teal';
}

type SortKey = 'count' | 'name' | 'trip' | 'date' | 'workday' | 'extra' | 'ticket' | 'totalDays' | 'totalCong';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'DAILY' | 'MONTHLY' | 'MATRIX' | 'MATRIX_PASSENGER';

const CustomerTable: React.FC<CustomerTableProps> = ({ 
  data, 
  title = "Bảng Khách Hàng", 
  colorTheme = 'green' 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('DAILY');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc'
  });
  
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu khách hàng.</div>;
  }

  // --- Helpers ---

  // Extract unique dates for Daily Filter
  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(data.map(d => d.date || 'Unknown'))).filter(d => d !== 'Unknown');
    return dates.sort((a: string, b: string) => {
        const da = a.split('/').reverse().join('');
        const db = b.split('/').reverse().join('');
        return db.localeCompare(da);
    });
  }, [data]);

  // Extract unique months for Monthly Filter
  const uniqueMonths = useMemo(() => {
      const months = new Set<string>();
      data.forEach(d => {
          if(d.date) {
              const parts = d.date.split('/');
              if(parts.length === 3) months.add(`${parts[1]}/${parts[2]}`); // MM/YYYY
          }
      });
      return Array.from(months).sort((a, b) => {
          const [m1, y1] = a.split('/').map(Number);
          const [m2, y2] = b.split('/').map(Number);
          return y2 - y1 || m2 - m1; // Sort Descending
      });
  }, [data]);

  // Set default selection on load
  useMemo(() => {
      if (selectedDate === 'ALL' && uniqueDates.length > 0) setSelectedDate(uniqueDates[0]);
      if (selectedMonth === 'ALL' && uniqueMonths.length > 0) setSelectedMonth(uniqueMonths[0]);
  }, [uniqueDates, uniqueMonths]);

  // Calculate Daily Stats (4 trips rule)
  const calculateDailyStats = (tripCount: number = 0) => {
      const standardWorkday = Math.min(tripCount / 4, 1);
      const extraTrips = Math.max(tripCount - 4, 0);
      return { standardWorkday, extraTrips };
  };

  // --- Global Aggregates for Daily View (Total Days, Total Cong) ---
  const driverAggregates = useMemo(() => {
      const map = new Map<string, { days: Set<string>, totalCong: number }>();
      
      data.forEach(d => {
          if (!map.has(d.driverName)) {
              map.set(d.driverName, { days: new Set(), totalCong: 0 });
          }
          const entry = map.get(d.driverName)!;
          
          if (d.date) entry.days.add(d.date);
          
          const { standardWorkday } = calculateDailyStats(d.tripCount);
          entry.totalCong += standardWorkday;
      });
      return map;
  }, [data]);

  // --- Aggregation Logic for Monthly View ---
  const monthlyData = useMemo(() => {
      if (viewMode !== 'MONTHLY') return [];

      // Filter by selected month
      const filteredByMonth = selectedMonth === 'ALL' 
        ? data 
        : data.filter(d => d.date && d.date.endsWith(selectedMonth));

      // Group by Driver
      const grouped = new Map<string, {
          driverName: string,
          totalCust: number,
          totalTickets: number,
          totalTrips: number,
          totalCong: number,
          totalExtra: number,
          daysWorked: number
      }>();

      filteredByMonth.forEach(item => {
          if (!grouped.has(item.driverName)) {
              grouped.set(item.driverName, {
                  driverName: item.driverName,
                  totalCust: 0, totalTickets: 0, totalTrips: 0, totalCong: 0, totalExtra: 0, daysWorked: 0
              });
          }
          const entry = grouped.get(item.driverName)!;
          
          entry.totalCust += item.customerCount;
          entry.totalTickets += (item.ticketCount || 0);
          entry.totalTrips += (item.tripCount || 0);
          entry.daysWorked += 1;

          // Calculate stats PER DAY then sum up (Correct way)
          const { standardWorkday, extraTrips } = calculateDailyStats(item.tripCount);
          entry.totalCong += standardWorkday;
          entry.totalExtra += extraTrips;
      });

      return Array.from(grouped.values());

  }, [data, selectedMonth, viewMode]);

  // --- Matrix Data Generation ---
  const matrixData = useMemo(() => {
      if ((viewMode !== 'MATRIX' && viewMode !== 'MATRIX_PASSENGER') || selectedMonth === 'ALL') return null;

      // 1. Determine days in month
      const [m, y] = selectedMonth.split('/').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const daysArray = Array.from({length: daysInMonth}, (_, i) => i + 1);

      // 2. Filter Data
      const filtered = data.filter(d => d.date && d.date.endsWith(selectedMonth));

      // 3. Map: Driver -> Day -> { Trips, Customers }
      const driverDayMap = new Map<string, Map<number, { trips: number, cust: number }>>();

      filtered.forEach(d => {
          if(!d.date) return;
          const day = parseInt(d.date.split('/')[0], 10);
          
          if (!driverDayMap.has(d.driverName)) driverDayMap.set(d.driverName, new Map());
          const dMap = driverDayMap.get(d.driverName)!;

          const current = dMap.get(day) || { trips: 0, cust: 0 };
          dMap.set(day, { 
              trips: current.trips + (d.tripCount || 0),
              cust: current.cust + (d.customerCount || 0)
          });
      });

      // 4. Convert to Rows with calculated stats
      const rows = Array.from(driverDayMap.keys()).sort().map(driver => {
          const dMap = driverDayMap.get(driver)!;
          let totalTrips = 0;
          let totalCust = 0;
          let totalCong = 0;
          let totalExtra = 0;
          
          const dayValues = daysArray.map(day => {
              const entry = dMap.get(day);
              if (entry) {
                  const { trips, cust } = entry;
                  const { standardWorkday, extraTrips } = calculateDailyStats(trips);
                  totalTrips += trips;
                  totalCust += cust;
                  totalCong += standardWorkday;
                  totalExtra += extraTrips;
                  return { trips, cust, cong: standardWorkday, extra: extraTrips };
              }
              return null;
          });

          return {
              driverName: driver,
              days: dayValues,
              totalTrips,
              totalCust,
              totalCong,
              totalExtra
          };
      });

      return { daysArray, rows };
  }, [data, selectedMonth, viewMode]);


  // --- Filtering & Sorting ---

  // Determine which dataset to use based on ViewMode
  const activeDataList = viewMode === 'DAILY' 
      ? (selectedDate === 'ALL' ? data : data.filter(d => d.date === selectedDate))
      : (viewMode === 'MONTHLY' ? monthlyData : []); // Matrix handled separately

  // Sorting
  const sortedData = [...activeDataList].sort((a, b) => {
      let valA: any, valB: any;
      
      if (viewMode === 'DAILY') {
          // Daily Sort
          const itemA = a as CustomerStat;
          const itemB = b as CustomerStat;
          const statsA = calculateDailyStats(itemA.tripCount);
          const statsB = calculateDailyStats(itemB.tripCount);
          
          const aggA = driverAggregates.get(itemA.driverName) || { days: new Set(), totalCong: 0 };
          const aggB = driverAggregates.get(itemB.driverName) || { days: new Set(), totalCong: 0 };

          switch(sortConfig.key) {
              case 'count': valA = itemA.customerCount; valB = itemB.customerCount; break;
              case 'ticket': valA = itemA.ticketCount || 0; valB = itemB.ticketCount || 0; break;
              case 'trip': valA = itemA.tripCount || 0; valB = itemB.tripCount || 0; break;
              case 'workday': valA = statsA.standardWorkday; valB = statsB.standardWorkday; break;
              case 'extra': valA = statsA.extraTrips; valB = statsB.extraTrips; break;
              case 'date': 
                valA = (itemA.date || '').split('/').reverse().join(''); 
                valB = (itemB.date || '').split('/').reverse().join(''); 
                break;
              case 'totalDays': valA = aggA.days.size; valB = aggB.days.size; break;
              case 'totalCong': valA = aggA.totalCong; valB = aggB.totalCong; break;
              default: valA = itemA.driverName; valB = itemB.driverName; break;
          }
      } else if (viewMode === 'MONTHLY') {
          // Monthly Sort
          const itemA = a as typeof monthlyData[0];
          const itemB = b as typeof monthlyData[0];

          switch(sortConfig.key) {
              case 'count': valA = itemA.totalCust; valB = itemB.totalCust; break;
              case 'ticket': valA = itemA.totalTickets; valB = itemB.totalTickets; break;
              case 'trip': valA = itemA.totalTrips; valB = itemB.totalTrips; break;
              case 'workday': valA = itemA.totalCong; valB = itemB.totalCong; break;
              case 'extra': valA = itemA.totalExtra; valB = itemB.totalExtra; break;
              default: valA = itemA.driverName; valB = itemB.driverName; break;
          }
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
  });

  // Calculate Totals for Dashboard
  const totalCustomers = activeDataList.reduce((sum, item) => sum + (viewMode === 'DAILY' ? (item as CustomerStat).customerCount : (item as any).totalCust), 0);
  const totalTickets = activeDataList.reduce((sum, item) => sum + (viewMode === 'DAILY' ? ((item as CustomerStat).ticketCount || 0) : (item as any).totalTickets), 0);
  const totalTrips = activeDataList.reduce((sum, item) => sum + (viewMode === 'DAILY' ? ((item as CustomerStat).tripCount || 0) : (item as any).totalTrips), 0);
  const maxCustomers = Math.max(...activeDataList.map(d => viewMode === 'DAILY' ? (d as CustomerStat).customerCount : (d as any).totalCust), 1);

  // --- CHART DATA PREPARATION ---
  const chartData = useMemo(() => {
    // If Daily All: Group by Date
    // If Monthly All: Group by Month (or top drivers?)
    // Let's do a simple Trend Chart: Date vs Customer Count
    if (viewMode === 'DAILY' && selectedDate === 'ALL') {
        const dateMap = new Map<string, {cust: number, trip: number}>();
        data.forEach(d => {
            if(!d.date) return;
            const current = dateMap.get(d.date) || {cust: 0, trip: 0};
            dateMap.set(d.date, {
                cust: current.cust + d.customerCount,
                trip: current.trip + (d.tripCount || 0)
            });
        });
        // Sort by Date Asc
        return Array.from(dateMap.entries())
            .map(([date, val]) => ({ label: date, cust: val.cust, trip: val.trip }))
            .sort((a,b) => a.label.split('/').reverse().join('').localeCompare(b.label.split('/').reverse().join('')));
    } 
    // If Specific Date or Monthly: Show Top Drivers bar chart
    else {
        // Take top 15 from sortedData
        return sortedData.slice(0, 15).map(item => {
            if (viewMode === 'DAILY') {
                const d = item as CustomerStat;
                return { label: d.driverName.split(' ').pop() || d.driverName, cust: d.customerCount, trip: d.tripCount || 0 };
            } else {
                const m = item as typeof monthlyData[0];
                return { label: m.driverName.split(' ').pop() || m.driverName, cust: m.totalCust, trip: m.totalTrips };
            }
        });
    }
  }, [data, viewMode, selectedDate, sortedData, monthlyData]);

  const maxChartCust = Math.max(...chartData.map(d => d.cust), 1);
  const maxChartTrip = Math.max(...chartData.map(d => d.trip), 1);


  // --- Actions ---

  const handleSort = (key: SortKey) => {
      let direction: SortDirection = 'desc';
      if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
      setSortConfig({ key, direction });
  };

  const handleExport = () => {
    if (viewMode === 'MATRIX' && matrixData) {
        // Matrix Export (Attendance)
        const exportRows = matrixData.rows.map(r => {
            const rowObj: any = { "Lái Xe": r.driverName };
            // Add columns 1..31
            matrixData.daysArray.forEach((day, idx) => {
                const val = r.days[idx];
                rowObj[`Ngày ${day}`] = val ? val.trips : ''; 
            });
            rowObj['Tổng Lượt'] = r.totalTrips;
            rowObj['Tổng Công'] = r.totalCong;
            rowObj['Tổng P.Sinh'] = r.totalExtra;
            return rowObj;
        });

        const ws = utils.json_to_sheet(exportRows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Bang_Cham_Cong_Thang");
        writeFile(wb, `Bao_Cao_Cham_Cong_${selectedMonth.replace(/\//g,'-')}.xlsx`);

    } else if (viewMode === 'MATRIX_PASSENGER' && matrixData) {
        // Matrix Export (Passenger Volume)
        const exportRows = matrixData.rows.map(r => {
            const rowObj: any = { "Lái Xe": r.driverName };
            // Add columns 1..31
            matrixData.daysArray.forEach((day, idx) => {
                const val = r.days[idx];
                rowObj[`Ngày ${day}`] = val ? val.cust : ''; 
            });
            rowObj['Tổng Khách'] = r.totalCust;
            return rowObj;
        });

        const ws = utils.json_to_sheet(exportRows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "San_Luong_Khach_Thang");
        writeFile(wb, `Bao_Cao_San_Luong_Khach_${selectedMonth.replace(/\//g,'-')}.xlsx`);

    } else if (viewMode === 'DAILY') {
        const exportData = sortedData.map(item => {
            const d = item as CustomerStat;
            const { standardWorkday, extraTrips } = calculateDailyStats(d.tripCount);
            const agg = driverAggregates.get(d.driverName) || { days: new Set(), totalCong: 0 };
            return {
                "Ngày": d.date || '',
                "Lái Xe": d.driverName,
                "Số Khách": d.customerCount,
                "Số Vé": d.ticketCount || 0,
                "Số Lượt": d.tripCount || 0,
                "Công (Ngày)": standardWorkday,
                "Phát Sinh (Ngày)": extraTrips,
                "Ngày Làm (Tổng)": agg.days.size,
                "Tổng Công (Tích Lũy)": agg.totalCong,
                "Ghi Chú": d.notes
            };
        });
        const ws = utils.json_to_sheet(exportData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Chi_Tiet_Ngay");
        writeFile(wb, `Bao_Cao_Ngay_${selectedDate.replace(/\//g,'-')}.xlsx`);
    } else {
        const exportData = sortedData.map(item => {
            const d = item as typeof monthlyData[0];
            return {
                "Lái Xe": d.driverName,
                "Tháng": selectedMonth,
                "Số Ngày Làm": d.daysWorked,
                "Tổng Khách": d.totalCust,
                "Tổng Vé": d.totalTickets,
                "Tổng Lượt": d.totalTrips,
                "Tổng Công": d.totalCong,
                "Tổng Phát Sinh": d.totalExtra
            };
        });
        const ws = utils.json_to_sheet(exportData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Tong_Hop_Thang");
        writeFile(wb, `Tong_Hop_Thang_${selectedMonth.replace(/\//g,'-')}.xlsx`);
    }
  };

  // --- Render ---

  // Theme Helpers
  const theme = {
    green: { bar: 'bg-green-500', bgLight: 'bg-green-50', textDark: 'text-green-800', icon: 'text-green-600', chartBar: 'bg-green-400' },
    teal: { bar: 'bg-teal-50', bgLight: 'bg-teal-50', textDark: 'text-teal-800', icon: 'text-teal-600', chartBar: 'bg-teal-400' }
  }[colorTheme];

  const SortIcon = ({ active, direction }: { active: boolean, direction: SortDirection }) => (
      <span className={`ml-1 inline-flex flex-col space-y-0.5 ${active ? 'opacity-100' : 'opacity-30'}`}>
          <svg className={`w-2 h-2 ${active && direction === 'asc' ? 'text-gray-800' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 16 16"><path d="M8 4l4 5H4z"/></svg>
          <svg className={`w-2 h-2 ${active && direction === 'desc' ? 'text-gray-800' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 16 16"><path d="M8 12l4-5H4z"/></svg>
      </span>
  );

  return (
    <div className="space-y-6">
       
       {/* Dashboard Summary (Only show in Daily/Monthly mode) */}
       {(viewMode !== 'MATRIX' && viewMode !== 'MATRIX_PASSENGER') && (
       <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className={`p-5 rounded-2xl border flex items-center gap-4 ${theme.bgLight} border-${colorTheme}-100`}>
             <div className={`p-3 bg-white rounded-full shadow-sm ${theme.icon}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
             </div>
             <div>
                <p className={`text-sm font-medium opacity-80 ${theme.textDark}`}>Tổng Khách</p>
                <p className={`text-2xl font-bold ${theme.textDark}`}>{totalCustomers.toLocaleString('vi-VN')}</p>
             </div>
          </div>
          <div className="p-5 rounded-2xl border border-gray-100 bg-white flex items-center gap-4">
             <div className="p-3 bg-orange-50 rounded-full text-orange-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
             </div>
             <div>
                <p className="text-sm font-medium text-gray-500">Tổng Vé</p>
                <p className="text-2xl font-bold text-gray-800">{totalTickets.toLocaleString('vi-VN')}</p>
             </div>
          </div>
          <div className="p-5 rounded-2xl border border-gray-100 bg-white flex items-center gap-4">
             <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             </div>
             <div>
                <p className="text-sm font-medium text-gray-500">Tổng Chuyến</p>
                <p className="text-2xl font-bold text-gray-800">{totalTrips.toLocaleString('vi-VN')}</p>
             </div>
          </div>
       </div>
       )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Controls Header */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-4 bg-gray-50">
           
           <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
               <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-full sm:w-auto overflow-x-auto">
                   <button 
                       onClick={() => setViewMode('DAILY')}
                       className={`flex-1 sm:flex-none px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${viewMode === 'DAILY' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                   >
                       Chi Tiết
                   </button>
                   <button 
                       onClick={() => setViewMode('MONTHLY')}
                       className={`flex-1 sm:flex-none px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${viewMode === 'MONTHLY' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                   >
                       Tổng Hợp
                   </button>
                   <button 
                       onClick={() => setViewMode('MATRIX')}
                       className={`flex-1 sm:flex-none px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${viewMode === 'MATRIX' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                   >
                       Bảng Chấm Công
                   </button>
                   <button 
                       onClick={() => setViewMode('MATRIX_PASSENGER')}
                       className={`flex-1 sm:flex-none px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all whitespace-nowrap ${viewMode === 'MATRIX_PASSENGER' ? 'bg-green-50 text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                   >
                       Báo Cáo Khách
                   </button>
               </div>

               <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

               {viewMode === 'DAILY' ? (
                   <select 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
                   >
                       <option value="ALL">Tất cả các ngày</option>
                       {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                   </select>
               ) : (
                   <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
                   >
                       <option value="ALL">Tất cả các tháng</option>
                       {uniqueMonths.map(m => <option key={m} value={m}>Tháng {m}</option>)}
                   </select>
               )}
           </div>
           
           <button 
                onClick={handleExport}
                className="w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {viewMode === 'MATRIX' ? 'Xuất Bảng Công' : (viewMode === 'MATRIX_PASSENGER' ? 'Xuất Báo Cáo Khách' : 'Xuất Excel')}
            </button>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {viewMode === 'MATRIX' && matrixData ? (
            <div className="max-h-[600px] overflow-y-auto relative">
                <table className="text-left text-sm text-gray-700 border-collapse border border-gray-200">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 bg-gray-50 border-b border-r sticky left-0 z-30 min-w-[180px] border-gray-200 font-bold">Lái Xe</th>
                            {matrixData.daysArray.map(day => (
                                <th key={day} className="px-1 py-3 border-b border-r border-gray-200 text-center min-w-[36px] w-9">{day}</th>
                            ))}
                            <th className="px-2 py-3 border-b border-r border-l border-gray-200 bg-gray-50 text-center font-bold text-gray-800 min-w-[70px]">Tổng Lượt</th>
                            <th className="px-2 py-3 border-b border-r border-gray-200 bg-gray-50 text-center font-bold text-blue-700 min-w-[70px]">Tổng Công</th>
                            <th className="px-2 py-3 border-b border-gray-200 bg-gray-50 text-center font-bold text-red-600 min-w-[70px]">Tổng P.Sinh</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {matrixData.rows.length === 0 ? (
                            <tr><td colSpan={36} className="p-8 text-center text-gray-400 italic">Vui lòng chọn tháng để xem bảng công.</td></tr>
                        ) : (
                            matrixData.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 border-r border-gray-200 font-medium text-gray-900 bg-white sticky left-0 z-10">{row.driverName}</td>
                                    {row.days.map((val, i) => (
                                        <td 
                                            key={i} 
                                            className={`px-1 py-2 text-center border-r border-gray-200 text-xs cursor-default transition-colors
                                                ${val ? 'text-gray-900 font-bold' : 'text-gray-200'}
                                                ${val && val.extra > 0 ? 'bg-red-50 text-red-700' : ''}
                                                ${val && val.cong >= 1 && val.extra === 0 ? 'bg-blue-50 text-blue-700' : ''}
                                                ${val && val.trips > 0 && val.trips < 4 ? 'bg-gray-50 text-gray-600' : ''}
                                            `}
                                            title={val ? `Ngày ${i+1}: ${val.trips} chuyến, ${val.cust} khách` : `Ngày ${i+1}: Nghỉ`}
                                        >
                                            {val ? val.trips : '-'}
                                        </td>
                                    ))}
                                    <td className="px-2 py-2 border-l border-r border-gray-200 text-center font-bold bg-gray-50">{row.totalTrips}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 text-center font-bold text-blue-700 bg-blue-50">{row.totalCong.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>
                                    <td className="px-2 py-2 text-center font-bold text-red-600 bg-red-50">{row.totalExtra > 0 ? row.totalExtra.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          ) : viewMode === 'MATRIX_PASSENGER' && matrixData ? (
             <div className="max-h-[600px] overflow-y-auto relative">
                <table className="text-left text-sm text-gray-700 border-collapse border border-gray-200">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 bg-gray-50 border-b border-r sticky left-0 z-30 min-w-[180px] border-gray-200 font-bold">Lái Xe</th>
                            {matrixData.daysArray.map(day => (
                                <th key={day} className="px-1 py-3 border-b border-r border-gray-200 text-center min-w-[36px] w-9">{day}</th>
                            ))}
                            <th className="px-2 py-3 border-b border-l border-gray-200 bg-green-50 text-center font-bold text-green-800 min-w-[80px]">Tổng Khách</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {matrixData.rows.length === 0 ? (
                            <tr><td colSpan={34} className="p-8 text-center text-gray-400 italic">Vui lòng chọn tháng để xem báo cáo sản lượng khách.</td></tr>
                        ) : (
                            matrixData.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 border-r border-gray-200 font-medium text-gray-900 bg-white sticky left-0 z-10">{row.driverName}</td>
                                    {row.days.map((val, i) => (
                                        <td 
                                            key={i} 
                                            className={`px-1 py-2 text-center border-r border-gray-200 text-xs cursor-default transition-colors
                                                ${val && val.cust > 0 ? 'text-gray-900 font-bold bg-green-50/30' : 'text-gray-200'}
                                            `}
                                            title={val ? `Ngày ${i+1}: ${val.cust} khách` : `Ngày ${i+1}: Nghỉ`}
                                        >
                                            {val ? val.cust : '-'}
                                        </td>
                                    ))}
                                    <td className="px-2 py-2 border-l border-gray-200 text-center font-bold bg-green-50 text-green-800">{row.totalCust.toLocaleString('vi-VN')}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          ) : (
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 font-semibold border-b text-gray-500 uppercase text-xs tracking-wider">
              <tr>
                {viewMode === 'DAILY' && (
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('date')}>
                        <div className="flex items-center">Ngày <SortIcon active={sortConfig.key === 'date'} direction={sortConfig.direction} /></div>
                    </th>
                )}
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Lái Xe <SortIcon active={sortConfig.key === 'name'} direction={sortConfig.direction} /></div>
                </th>
                <th className="px-6 py-4 w-32 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('count')}>
                     <div className="flex items-center">Khách {viewMode === 'MONTHLY' && '(Tổng)'} <SortIcon active={sortConfig.key === 'count'} direction={sortConfig.direction} /></div>
                </th>
                <th className="px-6 py-4 w-28 text-center cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('ticket')}>
                     <div className="flex items-center justify-center">Vé {viewMode === 'MONTHLY' && '(Tổng)'} <SortIcon active={sortConfig.key === 'ticket'} direction={sortConfig.direction} /></div>
                </th>
                <th className="px-6 py-4 w-28 text-center cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('trip')}>
                     <div className="flex items-center justify-center">Chuyến {viewMode === 'MONTHLY' && '(Tổng)'} <SortIcon active={sortConfig.key === 'trip'} direction={sortConfig.direction} /></div>
                </th>
                <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('workday')}>
                    <div className="flex items-center justify-center">Công {viewMode === 'MONTHLY' && '(Tổng)'} <SortIcon active={sortConfig.key === 'workday'} direction={sortConfig.direction} /></div>
                </th>
                
                {/* NEW COLUMNS for DAILY VIEW */}
                {viewMode === 'DAILY' && (
                    <>
                        <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 select-none text-blue-700 bg-blue-50/30" onClick={() => handleSort('totalDays')}>
                            <div className="flex items-center justify-center">Ngày Làm (Tổng) <SortIcon active={sortConfig.key === 'totalDays'} direction={sortConfig.direction} /></div>
                        </th>
                        <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 select-none text-blue-700 bg-blue-50/30" onClick={() => handleSort('totalCong')}>
                            <div className="flex items-center justify-center">Tổng Công <SortIcon active={sortConfig.key === 'totalCong'} direction={sortConfig.direction} /></div>
                        </th>
                    </>
                )}

                <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('extra')}>
                    <div className="flex items-center justify-center text-red-600">P.Sinh {viewMode === 'MONTHLY' && '(Tổng)'} <SortIcon active={sortConfig.key === 'extra'} direction={sortConfig.direction} /></div>
                </th>
                {viewMode === 'DAILY' && <th className="px-6 py-4">Ghi Chú</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedData.map((row, index) => {
                 // Type Guard Logic
                 let renderDate = '';
                 let renderName = '';
                 let renderCust = 0;
                 let renderTicket = 0;
                 let renderTrip = 0;
                 let renderCong = 0;
                 let renderExtra = 0;
                 let renderNote = '';
                 let renderTotalDays = 0;
                 let renderTotalCong = 0;

                 if (viewMode === 'DAILY') {
                     const d = row as CustomerStat;
                     const stats = calculateDailyStats(d.tripCount);
                     renderDate = d.date || '-';
                     renderName = d.driverName;
                     renderCust = d.customerCount;
                     renderTicket = d.ticketCount || 0;
                     renderTrip = d.tripCount || 0;
                     renderCong = stats.standardWorkday;
                     renderExtra = stats.extraTrips;
                     renderNote = d.notes || '';
                     
                     // Get Global Aggregates
                     const agg = driverAggregates.get(d.driverName);
                     renderTotalDays = agg ? agg.days.size : 0;
                     renderTotalCong = agg ? agg.totalCong : 0;

                 } else {
                     const m = row as typeof monthlyData[0];
                     renderName = m.driverName;
                     renderCust = m.totalCust;
                     renderTicket = m.totalTickets;
                     renderTrip = m.totalTrips;
                     renderCong = m.totalCong;
                     renderExtra = m.totalExtra;
                 }

                 const percent = maxCustomers > 0 ? (renderCust / maxCustomers) * 100 : 0;

                 return (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    {viewMode === 'DAILY' && <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">{renderDate}</td>}
                    
                    <td className="px-6 py-4 font-medium text-gray-900">
                        {renderName}
                        {viewMode === 'MONTHLY' && <div className="text-xs text-gray-400 font-normal mt-0.5">Làm {(row as any).daysWorked} ngày</div>}
                    </td>
                    
                    <td className="px-6 py-4">
                       <div className="flex flex-col gap-1">
                          <span className="font-bold text-gray-800 text-lg leading-none">{renderCust.toLocaleString('vi-VN')}</span>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className={`${theme.bar} h-1.5 rounded-full`} style={{ width: `${percent}%` }}></div>
                          </div>
                       </div>
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                         <span className="font-bold text-orange-600">{renderTicket.toLocaleString('vi-VN')}</span>
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                        {renderTrip > 0 ? (
                            <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 rounded font-bold border border-blue-100">
                                {renderTrip.toLocaleString('vi-VN')}
                            </span>
                        ) : <span className="text-gray-300">-</span>}
                    </td>
                    
                    <td className="px-6 py-4 text-center font-bold text-gray-700">
                        {renderCong.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
                    </td>
                    
                    {/* NEW CELLS for DAILY VIEW */}
                    {viewMode === 'DAILY' && (
                        <>
                             <td className="px-6 py-4 text-center bg-blue-50/10">
                                <span className="text-gray-600 font-semibold">{renderTotalDays}</span>
                            </td>
                            <td className="px-6 py-4 text-center bg-blue-50/10">
                                <span className="text-blue-700 font-bold">{renderTotalCong.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</span>
                            </td>
                        </>
                    )}

                    <td className="px-6 py-4 text-center">
                         {renderExtra > 0 ? (
                             <span className="inline-block px-2 py-1 bg-red-50 text-red-600 rounded font-bold border border-red-100">
                                 +{renderExtra.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
                             </span>
                         ) : <span className="text-gray-300">-</span>}
                    </td>
                    
                    {viewMode === 'DAILY' && <td className="px-6 py-4 text-gray-400 text-xs italic truncate max-w-xs">{renderNote}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>

       {/* Business Comparison Charts Section */}
       {(viewMode !== 'MATRIX' && viewMode !== 'MATRIX_PASSENGER') && chartData.length > 0 && (
           <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in">
               <div className="flex items-center justify-between mb-6">
                   <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                       <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                       Biểu Đồ Xu Hướng Kinh Doanh
                   </h3>
                   <div className="flex gap-4 text-xs font-medium">
                       <div className="flex items-center gap-1"><span className={`w-3 h-3 rounded-full ${theme.chartBar}`}></span> Khách</div>
                       <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400"></span> Chuyến</div>
                   </div>
               </div>
               
               <div className="h-64 w-full flex items-end justify-between gap-2">
                   {chartData.map((d, i) => {
                       const hCust = (d.cust / maxChartCust) * 100;
                       const hTrip = (d.trip / maxChartTrip) * 100;
                       return (
                           <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                               {/* Tooltip */}
                               <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                                   {d.label}: {d.cust} Khách, {d.trip} Chuyến
                               </div>
                               
                               <div className="w-full flex items-end justify-center gap-0.5 h-full relative">
                                   {/* Trip Bar (Orange) */}
                                   <div 
                                      className="w-1/2 bg-orange-400 rounded-t-sm opacity-80 hover:opacity-100 transition-all"
                                      style={{ height: `${Math.max(hTrip, 2)}%` }}
                                   ></div>
                                   {/* Customer Bar (Green/Teal) */}
                                   <div 
                                      className={`w-1/2 ${theme.chartBar} rounded-t-sm hover:opacity-90 transition-all shadow-sm`}
                                      style={{ height: `${Math.max(hCust, 2)}%` }}
                                   ></div>
                               </div>
                               <span className="text-[10px] text-gray-400 truncate w-full text-center">{d.label}</span>
                           </div>
                       )
                   })}
               </div>
           </div>
       )}
    </div>
  );
};

export default CustomerTable;
