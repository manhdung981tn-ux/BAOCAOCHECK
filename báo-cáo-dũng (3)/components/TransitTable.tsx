
import React, { useState, useMemo, useEffect } from 'react';
import { TransitStat } from '../types';
import { utils, writeFile } from 'xlsx';

interface TransitTableProps {
  data: TransitStat[];
}

type SortKey = 'date' | 'driver' | 'pax' | 'trips' | 'plate' | 'driversCount' | 'avgPax';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'DETAILED' | 'SUMMARY' | 'MATRIX'; // Added MATRIX

const TransitTable: React.FC<TransitTableProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('DETAILED');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('ALL'); // New State for Month

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc'
  });

  // Safe data to avoid hooks crashing on null/empty data if that happens
  const safeData = data || [];

  // Reset pagination when filters change
  useEffect(() => {
      setCurrentPage(1);
  }, [viewMode, searchQuery, selectedDate, selectedMonth, sortConfig]);

  // Extract unique dates for Detailed/Daily view
  const uniqueDates = useMemo(() => {
      const dates = Array.from(new Set(safeData.map(d => d.date))).filter(d => d !== '');
      return dates.sort((a: string, b: string) => b.split('/').reverse().join('').localeCompare(a.split('/').reverse().join('')));
  }, [safeData]);

  // Extract unique months for Matrix view
  const uniqueMonths = useMemo(() => {
      const months = new Set<string>();
      safeData.forEach(d => {
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
  }, [safeData]);

  // Set default selections via Effect, not Memo
  useEffect(() => {
      if (selectedDate === 'ALL' && uniqueDates.length > 0) setSelectedDate(uniqueDates[0]);
  }, [uniqueDates, selectedDate]);
  
  useEffect(() => {
      if (selectedMonth === 'ALL' && uniqueMonths.length > 0) setSelectedMonth(uniqueMonths[0]);
  }, [uniqueMonths, selectedMonth]);

  // --- 1. DETAILED DATA (Rows = Drivers) ---
  const filteredData = useMemo(() => {
      let res = safeData;
      if (selectedDate !== 'ALL' && viewMode === 'DETAILED') {
          res = res.filter(d => d.date === selectedDate);
      }
      if (searchQuery) {
          const lower = searchQuery.toLowerCase();
          res = res.filter(d => d.driverName.toLowerCase().includes(lower) || (d.licensePlate && d.licensePlate.toLowerCase().includes(lower)));
      }
      return res;
  }, [safeData, selectedDate, searchQuery, viewMode]);

  // --- 2. SUMMARY DATA (Rows = Dates) ---
  const summaryData = useMemo(() => {
      // Always compute summary for Chart, regardless of viewMode
      const map = new Map<string, { date: string, totalDrivers: number, totalPax: number, totalTrips: number, plates: Set<string> }>();

      safeData.forEach(d => {
          if (!d.date) return;
          if (!map.has(d.date)) {
              map.set(d.date, { date: d.date, totalDrivers: 0, totalPax: 0, totalTrips: 0, plates: new Set() });
          }
          const entry = map.get(d.date)!;
          entry.totalDrivers += 1;
          entry.totalPax += d.passengerCount;
          entry.totalTrips += (d.tripCount || 0);
          if (d.licensePlate) entry.plates.add(d.licensePlate);
      });

      return Array.from(map.values()).sort((a, b) => a.date.split('/').reverse().join('').localeCompare(b.date.split('/').reverse().join('')));
  }, [safeData]);

  // --- 3. MATRIX DATA (Rows = Drivers, Cols = Days) ---
  const matrixData = useMemo(() => {
      if (viewMode !== 'MATRIX' || selectedMonth === 'ALL') return null;

      // 1. Determine days in month
      const [m, y] = selectedMonth.split('/').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const daysArray = Array.from({length: daysInMonth}, (_, i) => i + 1);

      // 2. Filter Data by Month
      const filtered = safeData.filter(d => d.date && d.date.endsWith(selectedMonth));

      // 3. Map: Driver -> Day -> { Pax, Trips }
      const driverDayMap = new Map<string, Map<number, { pax: number, trips: number }>>();

      filtered.forEach(d => {
          if(!d.date) return;
          const day = parseInt(d.date.split('/')[0], 10);
          
          if (!driverDayMap.has(d.driverName)) driverDayMap.set(d.driverName, new Map());
          const dMap = driverDayMap.get(d.driverName)!;

          const current = dMap.get(day) || { pax: 0, trips: 0 };
          dMap.set(day, { 
              pax: current.pax + d.passengerCount,
              trips: current.trips + (d.tripCount || 0)
          });
      });

      // 4. Convert to Rows
      const rows = Array.from(driverDayMap.keys()).sort().map(driver => {
          const dMap = driverDayMap.get(driver)!;
          let totalPax = 0;
          let totalTrips = 0;
          
          const dayValues = daysArray.map(day => {
              const entry = dMap.get(day);
              if (entry) {
                  totalPax += entry.pax;
                  totalTrips += entry.trips;
                  return entry; // { pax, trips }
              }
              return null;
          });

          return {
              driverName: driver,
              days: dayValues,
              totalPax,
              totalTrips
          };
      });

      return { daysArray, rows };
  }, [safeData, selectedMonth, viewMode]);


  // --- Sorting Logic (Detailed/Summary only) ---
  const sortedData = useMemo(() => {
      if (viewMode === 'MATRIX') return []; // Matrix is sorted by name in construction

      const list = viewMode === 'DETAILED' ? filteredData : summaryData;
      
      return [...list].sort((a, b) => {
          let valA: any, valB: any;

          if (viewMode === 'DETAILED') {
              const itemA = a as TransitStat;
              const itemB = b as TransitStat;
              switch (sortConfig.key) {
                  case 'pax': valA = itemA.passengerCount; valB = itemB.passengerCount; break;
                  case 'trips': valA = itemA.tripCount || 0; valB = itemB.tripCount || 0; break;
                  case 'plate': valA = itemA.licensePlate || ''; valB = itemB.licensePlate || ''; break;
                  case 'driver': valA = itemA.driverName; valB = itemB.driverName; break;
                  default: valA = itemA.date.split('/').reverse().join(''); valB = itemB.date.split('/').reverse().join(''); break;
              }
          } else {
              const itemA = a as typeof summaryData[0];
              const itemB = b as typeof summaryData[0];
              switch (sortConfig.key) {
                  case 'pax': valA = itemA.totalPax; valB = itemB.totalPax; break;
                  case 'trips': valA = itemA.totalTrips; valB = itemB.totalTrips; break;
                  case 'driversCount': valA = itemA.totalDrivers; valB = itemB.totalDrivers; break;
                  case 'avgPax': valA = itemA.totalTrips ? itemA.totalPax/itemA.totalTrips : 0; valB = itemB.totalTrips ? itemB.totalPax/itemB.totalTrips : 0; break;
                  default: valA = itemA.date.split('/').reverse().join(''); valB = itemB.date.split('/').reverse().join(''); break;
              }
          }

          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [filteredData, summaryData, sortConfig, viewMode]);

  // --- Pagination Logic ---
  const paginatedData = useMemo(() => {
      if (viewMode === 'MATRIX') return [];
      const startIndex = (currentPage - 1) * itemsPerPage;
      return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage, viewMode]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);


  // Aggregates for Dashboard
  const totalPax = safeData.reduce((sum, d) => sum + d.passengerCount, 0);
  const totalTrips = safeData.reduce((sum, d) => sum + (d.tripCount || 0), 0);
  const totalDrivers = new Set(safeData.map(d => d.driverName)).size;

  const handleSort = (key: SortKey) => {
      let direction: SortDirection = 'desc';
      if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
      setSortConfig({ key, direction });
  };

  const handleExport = () => {
      if (viewMode === 'MATRIX' && matrixData) {
        // Matrix Export
        const exportRows = matrixData.rows.map(r => {
            const rowObj: any = { "Lái Xe": r.driverName };
            // Add columns 1..31
            matrixData.daysArray.forEach((day, idx) => {
                const val = r.days[idx];
                rowObj[`Ngày ${day}`] = val ? val.pax : ''; 
            });
            rowObj['Tổng Khách'] = r.totalPax;
            rowObj['Tổng Lượt'] = r.totalTrips;
            return rowObj;
        });

        const ws = utils.json_to_sheet(exportRows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Tong_Hop_Thang_TC");
        writeFile(wb, `Tong_Hop_Thang_TC_${selectedMonth.replace(/\//g,'-')}.xlsx`);

      } else if (viewMode === 'DETAILED') {
          const exportData = sortedData.map(item => {
              const d = item as TransitStat;
              return {
                  "Ngày": d.date,
                  "Lái Xe Trung Chuyển": d.driverName,
                  "Số Khách": d.passengerCount,
                  "Số Lượt": d.tripCount,
                  "Biển Số": d.licensePlate,
                  "Ghi Chú": d.notes
              };
          });
          const ws = utils.json_to_sheet(exportData);
          const wb = utils.book_new();
          utils.book_append_sheet(wb, ws, "Chi_Tiet_Trung_Chuyen");
          writeFile(wb, `Chi_Tiet_TC_${selectedDate.replace(/\//g,'-')}.xlsx`);
      } else {
          const exportData = sortedData.map(item => {
              const d = item as typeof summaryData[0];
              return {
                  "Ngày": d.date,
                  "Tổng Số Lái Xe": d.totalDrivers,
                  "Tổng Số Lượt": d.totalTrips,
                  "Tổng Số Khách": d.totalPax,
                  "Trung Bình Khách/Lượt": d.totalTrips ? (d.totalPax / d.totalTrips).toFixed(1) : 0,
                  "Biển Số Hoạt Động": Array.from(d.plates).join(', ')
              };
          });
          const ws = utils.json_to_sheet(exportData);
          const wb = utils.book_new();
          utils.book_append_sheet(wb, ws, "Tong_Hop_Ngay_TC");
          writeFile(wb, `Tong_Hop_Ngay_TC.xlsx`);
      }
  };

  // Check data for rendering *after* hooks
  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu xe trung chuyển.</div>;
  }

  // --- CHART DATA ---
  const maxSummaryPax = Math.max(...summaryData.map(d => d.totalPax), 1);
  const chartData = summaryData.slice(-30); // Last 30 days

  const SortIcon = ({ active, direction }: { active: boolean, direction: SortDirection }) => (
      <span className={`ml-1 inline-flex flex-col space-y-0.5 ${active ? 'opacity-100' : 'opacity-30'}`}>
          <svg className={`w-2 h-2 ${active && direction === 'asc' ? 'text-gray-800' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 16 16"><path d="M8 4l4 5H4z"/></svg>
          <svg className={`w-2 h-2 ${active && direction === 'desc' ? 'text-gray-800' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 16 16"><path d="M8 12l4-5H4z"/></svg>
      </span>
  );

  return (
    <div className="space-y-6">
        {/* Dashboard */}
        {viewMode !== 'MATRIX' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-sm font-medium">Tổng Khách TC</p>
                    <p className="text-2xl font-bold text-gray-800">{totalPax.toLocaleString('vi-VN')}</p>
                </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-sm font-medium">Tổng Lượt</p>
                    <p className="text-2xl font-bold text-gray-800">{totalTrips.toLocaleString('vi-VN')}</p>
                </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-sm font-medium">Lái Xe Hoạt Động</p>
                    <p className="text-2xl font-bold text-gray-800">{totalDrivers}</p>
                </div>
            </div>
        </div>
        )}

        {/* Controls */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-center">
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-center">
                {/* View Toggles */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setViewMode('DETAILED')}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap ${viewMode === 'DETAILED' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Chi Tiết
                    </button>
                    <button 
                        onClick={() => setViewMode('SUMMARY')}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap ${viewMode === 'SUMMARY' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Ngày
                    </button>
                    <button 
                        onClick={() => setViewMode('MATRIX')}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap ${viewMode === 'MATRIX' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Tổng Hợp Tháng
                    </button>
                </div>

                {viewMode === 'DETAILED' && (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <select 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium"
                        >
                            <option value="ALL">Tất cả ngày</option>
                            {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <div className="relative w-full sm:w-64">
                            <input 
                                type="text"
                                placeholder="Tìm lái xe hoặc biển số..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm w-full"
                            />
                            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                )}

                {viewMode === 'MATRIX' && (
                     <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium w-full sm:w-48"
                    >
                        <option value="ALL">Chọn tháng</option>
                        {uniqueMonths.map(m => <option key={m} value={m}>Tháng {m}</option>)}
                    </select>
                )}
            </div>
            
            <button 
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2 w-full lg:w-auto justify-center whitespace-nowrap"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {viewMode === 'MATRIX' ? 'Xuất Báo Cáo Tháng' : (viewMode === 'SUMMARY' ? 'Xuất Báo Cáo Ngày' : 'Xuất Chi Tiết')}
            </button>
        </div>

        {/* Table Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto min-h-[400px] relative">
                
                {/* 1. MATRIX VIEW */}
                {viewMode === 'MATRIX' && matrixData ? (
                    <div className="max-h-[600px] overflow-y-auto">
                        <table className="text-left text-sm text-gray-700 border-collapse border border-gray-200 w-full">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0 z-20 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 bg-gray-50 border-b border-r sticky left-0 z-30 min-w-[180px] border-gray-200 font-bold">Lái Xe</th>
                                    {matrixData.daysArray.map(day => (
                                        <th key={day} className="px-1 py-3 border-b border-r border-gray-200 text-center min-w-[36px] w-9">{day}</th>
                                    ))}
                                    <th className="px-2 py-3 border-b border-r border-l border-gray-200 bg-gray-50 text-center font-bold text-gray-800 min-w-[70px]">Tổng Khách</th>
                                    <th className="px-2 py-3 border-b border-gray-200 bg-gray-50 text-center font-bold text-blue-700 min-w-[70px]">Tổng Lượt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {matrixData.rows.length === 0 ? (
                                    <tr><td colSpan={36} className="p-8 text-center text-gray-400 italic">Vui lòng chọn tháng để xem báo cáo tổng hợp.</td></tr>
                                ) : (
                                    matrixData.rows.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 border-r border-gray-200 font-medium text-gray-900 bg-white sticky left-0 z-10">{row.driverName}</td>
                                            {row.days.map((val, i) => (
                                                <td 
                                                    key={i} 
                                                    className={`px-1 py-2 text-center border-r border-gray-200 text-xs cursor-default transition-colors
                                                        ${val ? 'text-gray-900 font-bold bg-cyan-50/50' : 'text-gray-200'}
                                                    `}
                                                    title={val ? `Ngày ${i+1}: ${val.pax} khách, ${val.trips} lượt` : `Ngày ${i+1}: Nghỉ`}
                                                >
                                                    {val ? val.pax : '-'}
                                                </td>
                                            ))}
                                            <td className="px-2 py-2 border-l border-r border-gray-200 text-center font-bold bg-gray-50 text-cyan-800">{row.totalPax.toLocaleString('vi-VN')}</td>
                                            <td className="px-2 py-2 border-r border-gray-200 text-center font-bold text-blue-700 bg-blue-50">{row.totalTrips.toLocaleString('vi-VN')}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                
                // 2. DETAILED / SUMMARY VIEW
                <>
                <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-gray-50 font-semibold text-gray-500 uppercase text-xs sticky top-0 z-10 shadow-sm">
                        <tr>
                            {viewMode === 'DETAILED' ? (
                                <>
                                    <th className="px-6 py-4 w-32 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>
                                        <div className="flex items-center">Ngày <SortIcon active={sortConfig.key === 'date'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('driver')}>
                                        <div className="flex items-center">Lái Xe Trung Chuyển <SortIcon active={sortConfig.key === 'driver'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('plate')}>
                                        <div className="flex items-center">Biển Số <SortIcon active={sortConfig.key === 'plate'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('pax')}>
                                        <div className="flex items-center justify-center">Số Khách <SortIcon active={sortConfig.key === 'pax'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('trips')}>
                                        <div className="flex items-center justify-center">Số Lượt <SortIcon active={sortConfig.key === 'trips'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4">Ghi Chú</th>
                                </>
                            ) : (
                                <>
                                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>
                                        <div className="flex items-center">Ngày Tổng Hợp <SortIcon active={sortConfig.key === 'date'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('driversCount')}>
                                        <div className="flex items-center justify-center">Số Lái Xe HĐ <SortIcon active={sortConfig.key === 'driversCount'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('trips')}>
                                        <div className="flex items-center justify-center">Tổng Lượt <SortIcon active={sortConfig.key === 'trips'} direction={sortConfig.direction} /></div>
                                    </th>
                                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('pax')}>
                                        <div className="flex items-center justify-center">Tổng Khách <SortIcon active={sortConfig.key === 'pax'} direction={sortConfig.direction} /></div>
                                    </th>
                                     <th className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('avgPax')}>
                                        <div className="flex items-center justify-center">TB Khách/Lượt <SortIcon active={sortConfig.key === 'avgPax'} direction={sortConfig.direction} /></div>
                                    </th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {viewMode === 'DETAILED' ? (
                            (paginatedData as TransitStat[]).map((row, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono text-gray-500">{row.date}</td>
                                <td className="px-6 py-4 font-bold text-gray-800">{row.driverName}</td>
                                <td className="px-6 py-4 text-gray-500 font-mono text-xs">{row.licensePlate || '-'}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className="inline-block px-3 py-1 bg-cyan-50 text-cyan-700 rounded-lg font-bold border border-cyan-100">
                                        {row.passengerCount}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center text-gray-600">{row.tripCount}</td>
                                <td className="px-6 py-4 text-gray-400 text-xs italic max-w-xs truncate">{row.notes}</td>
                            </tr>
                        ))
                        ) : (
                            (paginatedData as any[]).map((row, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono font-bold text-gray-800">{row.date}</td>
                                <td className="px-6 py-4 text-center font-medium text-gray-600">{row.totalDrivers}</td>
                                <td className="px-6 py-4 text-center font-medium text-gray-600">{row.totalTrips}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className="inline-block px-3 py-1 bg-cyan-100 text-cyan-800 rounded-lg font-bold border border-cyan-200">
                                        {row.totalPax.toLocaleString('vi-VN')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center text-gray-500">
                                    {row.totalTrips ? (row.totalPax / row.totalTrips).toFixed(1) : '0.0'}
                                </td>
                            </tr>
                        ))
                        )}
                        {sortedData.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400">Không tìm thấy dữ liệu phù hợp.</td></tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination Controls */}
                {sortedData.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-100 bg-gray-50 gap-4">
                    <div className="text-sm text-gray-500">
                        Hiển thị <span className="font-bold">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, sortedData.length)}</span> trên <span className="font-bold">{sortedData.length}</span> dòng
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={itemsPerPage}
                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                            <option value={10}>10 dòng</option>
                            <option value={20}>20 dòng</option>
                            <option value={50}>50 dòng</option>
                            <option value={100}>100 dòng</option>
                        </select>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                                Trước
                            </button>
                            <span className="px-3 py-1 text-sm font-medium text-gray-700 flex items-center">
                                Trang {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
                )}
                </>
                )}
            </div>
        </div>

        {/* Business Analytics Chart (Passenger Volume) */}
        {viewMode !== 'MATRIX' && summaryData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                       <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                       Biểu Đồ Lưu Lượng Khách (30 Ngày)
                   </h3>
                   <span className="text-xs font-medium bg-cyan-100 text-cyan-800 px-2 py-1 rounded">Ngày Đông Nhất: {summaryData.reduce((prev, curr) => (prev.totalPax > curr.totalPax) ? prev : curr).date}</span>
               </div>
               
               <div className="h-48 flex items-end justify-between gap-1 w-full border-b border-gray-200 relative">
                   {chartData.map((d, i) => {
                       const h = (d.totalPax / maxSummaryPax) * 100;
                       return (
                           <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                                   {d.date}: {d.totalPax} khách
                               </div>
                               <div 
                                    className="w-full bg-cyan-400 rounded-t-sm hover:bg-cyan-500 transition-colors opacity-80"
                                    style={{ height: `${Math.max(h, 2)}%` }}
                               ></div>
                               {/* Only show dates sparsely */}
                               {i % Math.ceil(chartData.length / 7) === 0 && (
                                   <span className="text-[10px] text-gray-400 absolute top-full mt-1 w-max">{d.date.slice(0,5)}</span>
                               )}
                           </div>
                       )
                   })}
               </div>
            </div>
        )}
    </div>
  );
};

export default TransitTable;
