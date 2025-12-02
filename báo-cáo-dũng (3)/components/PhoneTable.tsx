
import React, { useState, useMemo, useEffect } from 'react';
import { PhoneStat } from '../types';
import { utils, writeFile } from 'xlsx';

interface PhoneTableProps {
  data: PhoneStat[];
}

const PhoneTable: React.FC<PhoneTableProps> = ({ data }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('ALL');
  
  // Exclusion State
  const [showExcludePanel, setShowExcludePanel] = useState(false);
  const [excludeInput, setExcludeInput] = useState('');

  // Load excluded numbers from LocalStorage on mount
  useEffect(() => {
      const saved = localStorage.getItem('phoneExcludeList');
      if (saved) setExcludeInput(saved);
  }, []);

  // Save excluded numbers to LocalStorage when changed
  useEffect(() => {
      localStorage.setItem('phoneExcludeList', excludeInput);
  }, [excludeInput]);

  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu số điện thoại.</div>;
  }

  // Extract unique routes for filter
  const uniqueRoutes = useMemo(() => {
      const routes = new Set<string>();
      data.forEach(d => {
          if (d.routes && Array.isArray(d.routes)) {
            d.routes.forEach(r => routes.add(r));
          }
      });
      return Array.from(routes).sort();
  }, [data]);

  // Parse Excluded Set
  const excludedSet = useMemo(() => {
      const set = new Set<string>();
      // Split by comma, newline, semicolon, or space
      const parts = excludeInput.split(/[\n,;\s]+/);
      parts.forEach(p => {
          // Normalize: remove non-digits, handle 84 prefix
          let clean = p.replace(/\D/g, '');
          if (clean.startsWith('84')) clean = '0' + clean.substring(2);
          if (clean.length >= 9) set.add(clean);
      });
      return set;
  }, [excludeInput]);

  // Filter Data
  const filteredData = useMemo(() => {
      let res = data;

      // 1. Filter Excluded Numbers
      if (excludedSet.size > 0) {
          res = res.filter(d => !excludedSet.has(d.phoneNumber));
      }
      
      // 2. Filter by Route
      if (selectedRoute !== 'ALL') {
          res = res.filter(d => d.routes && d.routes.includes(selectedRoute));
      }

      // 3. Filter by Search
      if (searchQuery) {
          const lower = searchQuery.toLowerCase();
          res = res.filter(d => 
              d.phoneNumber.includes(lower) || 
              d.customerName.toLowerCase().includes(lower)
          );
      }
      return res;
  }, [data, searchQuery, selectedRoute, excludedSet]);

  // Stats (Calculated from FILTERED data)
  const totalCustomers = filteredData.length;
  const totalTrips = filteredData.reduce((sum, d) => sum + d.tripCount, 0);
  const vipCount = filteredData.filter(d => d.tripCount >= 5).length; 

  const handleExport = () => {
      const exportData = filteredData.map(d => ({
          "Số Điện Thoại": d.phoneNumber,
          "Tên Khách Hàng": d.customerName,
          "Số Lượt Đi": d.tripCount,
          "Tuyến Hay Đi": d.routes.join(', '),
          "Lần Cuối": d.lastDate,
          "Phân Loại": d.tripCount >= 10 ? "Kim Cương" : (d.tripCount >= 5 ? "Vàng" : "Thường")
      }));
      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Khach_Hang_SDT");
      writeFile(wb, `Bao_Cao_Khach_SDT.xlsx`);
  };

  return (
    <div className="space-y-6">
       {/* Dashboard */}
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <div>
                  <p className="text-gray-500 text-sm font-medium">Tổng Khách (SĐT)</p>
                  <p className="text-2xl font-bold text-gray-800">{totalCustomers}</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </div>
              <div>
                  <p className="text-gray-500 text-sm font-medium">Tổng Lượt Mua</p>
                  <p className="text-2xl font-bold text-gray-800">{totalTrips.toLocaleString('vi-VN')}</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <div>
                  <p className="text-gray-500 text-sm font-medium">Khách VIP ({'>'}5)</p>
                  <p className="text-2xl font-bold text-gray-800">{vipCount}</p>
              </div>
          </div>
       </div>

       <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
           {/* Header Controls */}
           <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-4">
               <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
                   <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="relative w-full sm:w-64">
                            <input 
                                type="text" 
                                placeholder="Tìm SĐT hoặc Tên..." 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        
                        {uniqueRoutes.length > 0 && (
                            <div className="relative w-full sm:w-48">
                                <select 
                                    value={selectedRoute}
                                    onChange={(e) => setSelectedRoute(e.target.value)}
                                    className="w-full h-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm appearance-none"
                                >
                                    <option value="ALL">Tất cả tuyến</option>
                                    {uniqueRoutes.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        )}
                   </div>

                   <div className="flex items-center gap-2 w-full lg:w-auto">
                        <button 
                            onClick={() => setShowExcludePanel(!showExcludePanel)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg border flex items-center gap-2 transition-colors w-full sm:w-auto justify-center
                                ${showExcludePanel || excludedSet.size > 0 ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            {excludedSet.size > 0 ? `Đã loại trừ (${excludedSet.size})` : 'Loại trừ SĐT'}
                        </button>
                        <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Xuất Excel
                        </button>
                   </div>
               </div>

               {/* Exclusion Panel */}
               {showExcludePanel && (
                   <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 animate-fade-in">
                       <label className="block text-sm font-bold text-gray-700 mb-2">Nhập danh sách SĐT cần loại trừ (Hotline, Lái xe...)</label>
                       <p className="text-xs text-gray-500 mb-2">Nhập các số cách nhau bởi dấu phẩy, khoảng trắng hoặc xuống dòng.</p>
                       <textarea 
                            rows={3}
                            className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none font-mono"
                            placeholder="Ví dụ: 0912345678, 0987654321..."
                            value={excludeInput}
                            onChange={(e) => setExcludeInput(e.target.value)}
                       />
                       <div className="flex justify-end mt-2">
                           <button onClick={() => setShowExcludePanel(false)} className="text-xs text-blue-600 hover:underline">Ẩn cài đặt</button>
                       </div>
                   </div>
               )}
           </div>
           
           <div className="max-h-[600px] overflow-auto">
               <table className="w-full text-left text-sm text-gray-700">
                   <thead className="bg-gray-50 font-semibold text-gray-500 uppercase text-xs sticky top-0 z-10 shadow-sm">
                       <tr>
                           <th className="px-6 py-4 w-16">Top</th>
                           <th className="px-6 py-4">Số Điện Thoại</th>
                           <th className="px-6 py-4">Tên Khách Hàng</th>
                           <th className="px-6 py-4 text-center">Số Lượt Đi</th>
                           <th className="px-6 py-4">Tuyến Hay Đi</th>
                           <th className="px-6 py-4 text-center">Phân Hạng</th>
                           <th className="px-6 py-4">Lần Cuối</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                       {filteredData.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-gray-400">
                                {data.length > 0 ? 'Tất cả dữ liệu đã bị lọc.' : 'Không tìm thấy khách hàng nào.'}
                            </td></tr>
                       ) : (
                        filteredData.map((row, index) => {
                           // Badges
                           let rankBadge = <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-medium">Thường</span>;
                           if (row.tripCount >= 10) rankBadge = <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold border border-purple-200">Kim Cương</span>;
                           else if (row.tripCount >= 5) rankBadge = <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold border border-yellow-200">Vàng</span>;
                           else if (row.tripCount >= 3) rankBadge = <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">Bạc</span>;

                           // Top 3 Highlight
                           const rankClass = index < 3 ? "bg-yellow-50/50" : "";
                           const rankIcon = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : `${index + 1}`));

                           return (
                               <tr key={index} className={`hover:bg-gray-50 ${rankClass}`}>
                                   <td className="px-6 py-4 font-bold text-gray-500 text-center">{rankIcon}</td>
                                   <td className="px-6 py-4 font-mono font-bold text-gray-800">{row.phoneNumber.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}</td>
                                   <td className="px-6 py-4 font-medium">{row.customerName || <span className="text-gray-300 italic">Chưa có tên</span>}</td>
                                   <td className="px-6 py-4 text-center">
                                       <span className="inline-block px-3 py-1 bg-white border border-gray-200 rounded-lg font-bold shadow-sm">{row.tripCount}</span>
                                   </td>
                                   <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={row.routes.join(', ')}>
                                       {row.routes.slice(0, 2).join(', ')}
                                       {row.routes.length > 2 && <span className="text-gray-400"> +{row.routes.length - 2} khác</span>}
                                   </td>
                                   <td className="px-6 py-4 text-center">{rankBadge}</td>
                                   <td className="px-6 py-4 text-gray-400 text-xs">{row.lastDate || '-'}</td>
                               </tr>
                           );
                       })
                       )}
                   </tbody>
               </table>
           </div>
       </div>
    </div>
  );
};

export default PhoneTable;
