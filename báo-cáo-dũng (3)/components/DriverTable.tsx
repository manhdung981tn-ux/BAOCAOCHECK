
import React, { useState, useMemo, useRef, UIEvent, useEffect } from 'react';
import { DriverStat } from '../types';

interface DriverTableProps {
  data: DriverStat[];
}

const DriverTable: React.FC<DriverTableProps> = ({ data }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Constants for Virtualization
  const ROW_HEIGHT = 64; 
  const TABLE_HEIGHT = 600; 
  const OVERSCAN = 5; 

  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu phân tích.</div>;
  }

  // 1. Filter Data
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const lowerQuery = searchQuery.toLowerCase();
    return data.filter(d => 
        d.driverName.toLowerCase().includes(lowerQuery) || 
        (d.notes && d.notes.toLowerCase().includes(lowerQuery))
    );
  }, [data, searchQuery]);

  // 2. Sort Data (High trips first)
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => b.tripCount - a.tripCount);
  }, [filteredData]);

  // 3. Reset Scroll
  useEffect(() => {
      if (tableContainerRef.current) {
          tableContainerRef.current.scrollTop = 0;
          setScrollTop(0);
      }
  }, [searchQuery, data]); 

  // 4. Calculate Summary Stats
  const totalTrips = sortedData.reduce((sum, item) => sum + item.tripCount, 0);
  const totalDrivers = sortedData.length;
  const avgTrips = totalDrivers > 0 ? Math.round(totalTrips / totalDrivers) : 0;
  const maxTrips = useMemo(() => Math.max(...data.map(d => d.tripCount), 1), [data]); 

  const aboveAvgCount = useMemo(() => sortedData.filter(d => d.tripCount >= avgTrips).length, [sortedData, avgTrips]);
  const aboveAvgPct = totalDrivers > 0 ? Math.round((aboveAvgCount / totalDrivers) * 100) : 0;

  // --- CHART DATA PREPARATION ---
  
  // Chart 1: Top 10 Performers (Expanded)
  const topPerformers = useMemo(() => {
      return sortedData.slice(0, 10);
  }, [sortedData]);

  // Chart 2: Dynamic Distribution Buckets
  const distributionData = useMemo(() => {
      // Create buckets
      const bucketCount = 6;
      const bucketSize = Math.ceil(maxTrips / bucketCount);
      const buckets = Array.from({ length: bucketCount }, (_, i) => {
          const min = i * bucketSize;
          const max = (i + 1) * bucketSize - (i === bucketCount - 1 ? 0 : 1);
          return { label: `${min}-${max}`, min, max, count: 0 };
      });
      
      sortedData.forEach(d => {
          const b = buckets.find(bucket => d.tripCount >= bucket.min && d.tripCount <= bucket.max);
          if (b) b.count++;
      });
      
      const maxCount = Math.max(...buckets.map(b => b.count), 1);
      return { buckets, maxCount };
  }, [sortedData, maxTrips]);


  // 5. Virtualization Rendering Logic
  const totalContentHeight = sortedData.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    sortedData.length, 
    Math.ceil((scrollTop + TABLE_HEIGHT) / ROW_HEIGHT) + OVERSCAN
  );
  
  const visibleRows = sortedData.slice(startIndex, endIndex);
  
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = Math.max(0, totalContentHeight - (startIndex + visibleRows.length) * ROW_HEIGHT);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
            <input
                type="text"
                placeholder="Tìm kiếm tên lái xe..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
                <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                </button>
            )}
        </div>
        <div className="text-sm text-gray-500 font-medium">
            Tìm thấy <span className="text-indigo-600 font-bold">{totalDrivers}</span> kết quả
        </div>
      </div>

      {/* Analytics Dashboard (Charts & Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Summary Cards & Efficiency Chart */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:border-blue-200 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-medium uppercase">Số Lái Xe</p>
                        <p className="text-xl font-bold text-gray-800">{totalDrivers}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:border-indigo-200 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-medium uppercase">Tổng Lượt</p>
                        <p className="text-xl font-bold text-gray-800">{totalTrips.toLocaleString('vi-VN')}</p>
                    </div>
                </div>
            </div>

            {/* Efficiency Donut Chart */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between transition-transform hover:-translate-y-1 duration-300">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Hiệu Suất Đội Xe</p>
                    <p className="text-xl font-bold text-gray-800">{aboveAvgPct}% <span className="text-xs font-normal text-gray-400">trên TB</span></p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">{aboveAvgCount} lái xe đạt chuẩn</p>
                </div>
                <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        <path className="text-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                        <path className="text-emerald-500 transition-all duration-1000 ease-out" strokeDasharray={`${aboveAvgPct}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
                        {aboveAvgPct}%
                    </div>
                </div>
            </div>
          </div>

          {/* Column 2: Top Performers Horizontal Bar Chart */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
             <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Top 10 Lái Xe Năng Nổ
             </h4>
             <div className="space-y-3 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                 {topPerformers.map((driver, idx) => {
                     const pct = (driver.tripCount / (topPerformers[0]?.tripCount || 1)) * 100;
                     // Distinct Rank Colors
                     let rankColor = "bg-indigo-500";
                     let textColor = "text-gray-600";
                     if (idx === 0) { rankColor = "bg-yellow-400"; textColor="text-yellow-700 font-bold"; }
                     else if (idx === 1) { rankColor = "bg-gray-400"; textColor="text-gray-700 font-bold"; }
                     else if (idx === 2) { rankColor = "bg-orange-400"; textColor="text-orange-700 font-bold"; }

                     return (
                         <div key={idx} className="flex items-center gap-3 text-xs">
                             <span className={`w-5 text-center ${textColor}`}>{idx + 1}</span>
                             <span className="w-24 truncate text-gray-600 font-medium" title={driver.driverName}>{driver.driverName}</span>
                             <div className="flex-1 bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                 <div className={`${rankColor} h-full rounded-full transition-all duration-500 shadow-sm`} style={{ width: `${pct}%` }}></div>
                             </div>
                             <span className="w-8 text-right font-bold text-gray-800">{driver.tripCount}</span>
                         </div>
                     )
                 })}
                 {topPerformers.length === 0 && <p className="text-gray-400 text-sm text-center italic">Chưa có dữ liệu</p>}
             </div>
          </div>

          {/* Column 3: Trip Distribution Vertical Bar Chart */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Phân Bổ Lượt Chạy
              </h4>
              <div className="flex items-end justify-between gap-2 flex-1 h-32 px-2 border-b border-gray-100 pb-2">
                  {distributionData.buckets.map((b, idx) => {
                      const heightPct = (b.count / distributionData.maxCount) * 100;
                      // Highlight high-performance buckets
                      const isHighPerf = idx >= distributionData.buckets.length - 2;
                      const barGradient = isHighPerf ? "from-orange-400 to-orange-300" : "from-emerald-400 to-emerald-300";
                      
                      return (
                          <div key={idx} className="flex flex-col items-center gap-1 flex-1 group h-full justify-end relative">
                              <span className="text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity mb-1 absolute -top-5">{b.count}</span>
                              <div 
                                className={`w-full bg-gradient-to-t ${barGradient} rounded-t-sm hover:brightness-110 transition-all relative shadow-sm`}
                                style={{ height: `${Math.max(heightPct, 4)}%` }}
                                title={`${b.label} lượt: ${b.count} lái xe`}
                              ></div>
                          </div>
                      )
                  })}
              </div>
              <div className="flex justify-between mt-2 px-1 gap-1">
                 {distributionData.buckets.map((b, idx) => (
                     <span key={idx} className="text-[9px] text-gray-400 font-medium text-center flex-1">{b.label}</span>
                 ))}
              </div>
          </div>
      </div>

      {/* Virtual Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
           <h3 className="font-bold text-gray-800">Danh Sách Chi Tiết</h3>
        </div>
        
        {/* Scrollable Container */}
        <div 
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="overflow-auto relative"
            style={{ height: TABLE_HEIGHT }} 
        >
          <table className="w-full text-left text-sm text-gray-700 table-fixed">
            <thead className="bg-gray-50 font-semibold text-gray-500 uppercase text-xs tracking-wider sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 w-16 bg-gray-50 border-b">#</th>
                <th className="px-6 py-4 w-1/4 bg-gray-50 border-b">Tên Lái Xe</th>
                <th className="px-6 py-4 w-1/4 bg-gray-50 border-b">Biểu Đồ Hiệu Suất</th>
                <th className="px-6 py-4 w-32 text-center bg-gray-50 border-b">Số Lượt</th>
                <th className="px-6 py-4 w-32 bg-gray-50 border-b">Tổng Km</th>
                <th className="px-6 py-4 bg-gray-50 border-b">Ghi Chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paddingTop > 0 && <tr style={{ height: paddingTop }} />}
              
              {visibleRows.map((row, index) => {
                const globalIndex = startIndex + index;
                const percent = maxTrips > 0 ? (row.tripCount / maxTrips) * 100 : 0;
                const avgPercent = maxTrips > 0 ? (avgTrips / maxTrips) * 100 : 0;
                
                let barColor = "bg-blue-500";
                if (percent >= 80) barColor = "bg-orange-500";
                else if (percent >= 50) barColor = "bg-emerald-500";
                else if (percent <= 20) barColor = "bg-gray-400";

                const initials = row.driverName.split(' ').map(n => n[0]).slice(-2).join('').toUpperCase();
                const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700'];
                const avatarColor = colors[globalIndex % colors.length];

                return (
                  <tr key={globalIndex} className="hover:bg-gray-50 transition-colors h-16">
                    <td className="px-6 py-3 text-gray-400 font-mono text-xs">{globalIndex + 1}</td>
                    <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor}`}>
                                {initials}
                            </div>
                            <span className="font-medium text-gray-900 truncate" title={row.driverName}>{row.driverName}</span>
                        </div>
                    </td>
                    <td className="px-6 py-3">
                        <div className="w-full max-w-[160px] flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                                <span>{Math.round(percent)}%</span>
                                {row.tripCount >= avgTrips ? (
                                    <span className="text-emerald-600 font-bold flex items-center">
                                        <svg className="w-2 h-2 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                        Avg
                                    </span>
                                ) : (
                                    <span className="text-gray-400">vs Avg</span>
                                )}
                            </div>
                            <div className="relative h-2.5 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                    className={`h-full ${barColor} rounded-full transition-all duration-500`} 
                                    style={{ width: `${percent}%` }}
                                ></div>
                                <div 
                                    className="absolute top-0 bottom-0 w-0.5 bg-gray-800 opacity-30 z-10" 
                                    style={{ left: `${avgPercent}%` }} 
                                    title={`Trung bình: ${avgTrips} lượt`}
                                ></div>
                            </div>
                        </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-gray-50 text-gray-900 font-bold border border-gray-200 shadow-sm text-xs min-w-[3rem]">
                        {row.tripCount}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 truncate" title={row.totalDistance}>{row.totalDistance || '-'}</td>
                    <td className="px-6 py-3 text-gray-400 text-xs italic truncate" title={row.notes}>{row.notes}</td>
                  </tr>
                );
              })}

              {paddingBottom > 0 && <tr style={{ height: paddingBottom }} />}
            </tbody>
          </table>

          {sortedData.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <p>Không tìm thấy lái xe nào phù hợp.</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverTable;
