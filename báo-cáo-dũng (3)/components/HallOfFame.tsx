
import React, { useState, useMemo } from 'react';
import { CustomerStat, TransitStat } from '../types';

interface HallOfFameProps {
  dailyCustomerData: CustomerStat[];
  transitData: TransitStat[];
}

type DriverType = 'LONG_DISTANCE' | 'TRANSIT';
type SortMetric = 'CONG' | 'PAX' | 'TRIPS';

const HallOfFame: React.FC<HallOfFameProps> = ({ dailyCustomerData, transitData }) => {
  const [activeType, setActiveType] = useState<DriverType>('LONG_DISTANCE');
  const [sortMetric, setSortMetric] = useState<SortMetric>('CONG');

  // --- KPI CONSTANTS ---
  const KPI_CONG_TARGET = 26; // Standard full month
  const KPI_CONG_WARN = 20;   // Danger zone
  
  // --- DATA PROCESSING ---
  const drivers = useMemo(() => {
      const map = new Map<string, { 
          name: string, 
          type: DriverType,
          totalPax: number, 
          totalTrips: number, 
          totalCong: number,
          daysWorked: Set<string>
      }>();

      // Helper to add data
      const update = (name: string, pax: number, trips: number, date: string, type: DriverType) => {
          if (!name) return;
          const key = name.trim();
          
          if (!map.has(key)) {
              map.set(key, { 
                  name: key, 
                  type, 
                  totalPax: 0, 
                  totalTrips: 0, 
                  totalCong: 0, 
                  daysWorked: new Set() 
              });
          }
          const entry = map.get(key)!;
          
          if (type === 'TRANSIT') entry.type = 'TRANSIT';

          entry.totalPax += pax;
          entry.totalTrips += trips;
          if (date) entry.daysWorked.add(date);

          // Calculate Cong
          if (type === 'LONG_DISTANCE') {
              // Rule: 4 trips = 1 cong
              entry.totalCong += Math.min(trips / 4, 1);
          }
      };

      // Process Long Distance (Daily Customers Only)
      dailyCustomerData.forEach(d => update(d.driverName, d.customerCount, d.tripCount || 0, d.date || '', 'LONG_DISTANCE'));
      
      // Process Transit
      transitData.forEach(d => update(d.driverName, d.passengerCount, d.tripCount || 0, d.date, 'TRANSIT'));

      // Finalize
      return Array.from(map.values()).map(d => {
          if (d.type === 'TRANSIT') {
              d.totalCong = d.daysWorked.size; // Transit Cong = Days Worked
          }
          return d;
      });
  }, [dailyCustomerData, transitData]);

  // --- FILTER & SORT ---
  const filteredDrivers = useMemo(() => {
      return drivers
        .filter(d => d.type === activeType)
        .sort((a, b) => {
            if (sortMetric === 'CONG') return b.totalCong - a.totalCong;
            if (sortMetric === 'PAX') return b.totalPax - a.totalPax;
            return b.totalTrips - a.totalTrips;
        });
  }, [drivers, activeType, sortMetric]);

  // --- SEGMENTATION ---
  const top3 = filteredDrivers.slice(0, 3);
  const rest = filteredDrivers.slice(3);

  // Motivation Lists
  const almostThere = filteredDrivers.filter(d => d.totalCong >= KPI_CONG_WARN && d.totalCong < KPI_CONG_TARGET);
  const lazyDrivers = filteredDrivers.filter(d => d.totalCong < 15 && d.totalCong > 0); 

  // --- UI HELPERS ---
  const MetricValue = ({ driver }: { driver: any }) => {
      if (sortMetric === 'CONG') return <span className="text-xl font-bold text-blue-600">{driver.totalCong.toLocaleString('vi-VN', {maximumFractionDigits: 1})} <span className="text-xs text-gray-400">công</span></span>;
      if (sortMetric === 'PAX') return <span className="text-xl font-bold text-green-600">{driver.totalPax.toLocaleString()} <span className="text-xs text-gray-400">khách</span></span>;
      return <span className="text-xl font-bold text-orange-600">{driver.totalTrips.toLocaleString()} <span className="text-xs text-gray-400">lượt</span></span>;
  };

  if (drivers.length === 0) {
      return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu để xếp hạng.</div>;
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
        {/* HEADER & CONTROLS */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div>
                <h2 className="text-3xl font-extrabold text-gray-800 flex items-center gap-3">
                    <span className="text-4xl">🏆</span> Bảng Vinh Danh & KPI
                </h2>
                <p className="text-gray-500 mt-1">Đánh giá hiệu suất, vinh danh cá nhân xuất sắc và nhắc nhở nhân sự.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
                {/* Type Toggle */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveType('LONG_DISTANCE')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeType === 'LONG_DISTANCE' ? 'bg-white text-indigo-700 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Lái Xe Đường Dài
                    </button>
                    <button 
                        onClick={() => setActiveType('TRANSIT')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeType === 'TRANSIT' ? 'bg-white text-cyan-700 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Xe Trung Chuyển
                    </button>
                </div>

                {/* Metric Toggle */}
                <select 
                    value={sortMetric}
                    onChange={(e) => setSortMetric(e.target.value as SortMetric)}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-xl font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                    <option value="CONG">Xếp hạng theo: Công (Ngày làm)</option>
                    <option value="PAX">Xếp hạng theo: Sản lượng Khách</option>
                    <option value="TRIPS">Xếp hạng theo: Số Lượt Chạy</option>
                </select>
            </div>
        </div>

        {/* --- THE PODIUM (TOP 3) --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            {/* 2nd Place */}
            {top3[1] && (
                <div className="order-2 md:order-1 bg-white p-6 rounded-t-2xl rounded-b-xl shadow-sm border border-gray-200 flex flex-col items-center transform hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden">
                    <div className="absolute top-0 w-full h-2 bg-gray-300"></div>
                    <div className="text-5xl mb-4 grayscale opacity-80">🥈</div>
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-500 mb-3 border-4 border-gray-200">
                        {top3[1].name.split(' ').pop()?.[0]}
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 text-center line-clamp-1">{top3[1].name}</h3>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Á QUÂN</span>
                    <MetricValue driver={top3[1]} />
                </div>
            )}

            {/* 1st Place */}
            {top3[0] && (
                <div className="order-1 md:order-2 bg-gradient-to-b from-yellow-50 to-white p-8 rounded-t-3xl rounded-b-2xl shadow-lg border border-yellow-200 flex flex-col items-center transform hover:-translate-y-3 transition-transform duration-300 relative z-10">
                    <div className="absolute top-0 w-full h-3 bg-yellow-400"></div>
                    <div className="absolute -top-6 text-6xl drop-shadow-md animate-bounce-slow">👑</div>
                    <div className="mt-6 w-28 h-28 rounded-full bg-yellow-100 flex items-center justify-center text-4xl font-bold text-yellow-600 mb-4 border-4 border-yellow-300 shadow-inner">
                        {top3[0].name.split(' ').pop()?.[0]}
                    </div>
                    <h3 className="text-2xl font-extrabold text-gray-900 text-center mb-1">{top3[0].name}</h3>
                    <span className="bg-yellow-400 text-white text-xs font-bold px-3 py-1 rounded-full mb-4 shadow-sm">NHÀ VÔ ĐỊCH</span>
                    <div className="bg-white px-6 py-2 rounded-xl shadow-sm border border-yellow-100">
                        <MetricValue driver={top3[0]} />
                    </div>
                </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
                <div className="order-3 md:order-3 bg-white p-6 rounded-t-2xl rounded-b-xl shadow-sm border border-gray-200 flex flex-col items-center transform hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden">
                    <div className="absolute top-0 w-full h-2 bg-orange-300"></div>
                    <div className="text-5xl mb-4 sepia opacity-80">🥉</div>
                    <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center text-2xl font-bold text-orange-500 mb-3 border-4 border-orange-200">
                        {top3[2].name.split(' ').pop()?.[0]}
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 text-center line-clamp-1">{top3[2].name}</h3>
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">QUÝ QUÂN</span>
                    <MetricValue driver={top3[2]} />
                </div>
            )}
        </div>

        {/* --- MOTIVATION & SHAME SECTION --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* 1. Motivational Zone (Close to KPI) */}
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-blue-100 border-b border-blue-200 flex items-center justify-between">
                    <h4 className="font-bold text-blue-800 flex items-center gap-2">
                        <span>🚀</span> Sắp Cán Đích KPI ({KPI_CONG_WARN}-{KPI_CONG_TARGET - 1} công)
                    </h4>
                    <span className="text-xs font-bold bg-white text-blue-600 px-2 py-1 rounded-md">{almostThere.length} tài xế</span>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto custom-scrollbar">
                    {almostThere.length > 0 ? (
                        <div className="space-y-3">
                            {almostThere.map((d, i) => (
                                <div key={i} className="flex items-center justify-between bg-white p-3 rounded-xl border border-blue-50 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                                            {d.name.split(' ').pop()?.[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-700 text-sm">{d.name}</p>
                                            <p className="text-xs text-blue-500">Cần thêm {KPI_CONG_TARGET - Math.floor(d.totalCong)} công để đạt chuẩn</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-gray-800">{d.totalCong.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400 italic">Không có ai ở nhóm này. Mọi người đều rất giỏi hoặc cần cố gắng nhiều!</div>
                    )}
                </div>
            </div>

            {/* 2. The "Wooden Spoon" (Low Performance) */}
            <div className="bg-gradient-to-br from-red-50 to-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-red-100 border-b border-red-200 flex items-center justify-between">
                    <h4 className="font-bold text-red-800 flex items-center gap-2">
                        <span>🐢</span> Góc Nhắc Nhở / Cần Cố Gắng ({'<'} 15 công)
                    </h4>
                    <span className="text-xs font-bold bg-white text-red-600 px-2 py-1 rounded-md">{lazyDrivers.length} tài xế</span>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto custom-scrollbar">
                    {lazyDrivers.length > 0 ? (
                        <div className="space-y-3">
                            {lazyDrivers.map((d, i) => (
                                <div key={i} className="flex items-center justify-between bg-white p-3 rounded-xl border border-red-50 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs">
                                            !
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-600 text-sm">{d.name}</p>
                                            <p className="text-[10px] text-red-400 italic">
                                                {d.totalCong < 5 ? "Đang ngủ đông? 🐻" : "Tăng tốc lên nào! 🏎️"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-bold text-red-600 block">{d.totalCong.toFixed(1)}</span>
                                        <span className="text-[10px] text-gray-400">công</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-green-500 italic font-medium">Tuyệt vời! Không có ai bị "đội sổ" hôm nay. 🎉</div>
                    )}
                </div>
            </div>
        </div>

        {/* --- FULL LIST --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-gray-700">Bảng Xếp Hạng Chi Tiết ({filteredDrivers.length} lái xe)</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-white text-gray-500 uppercase text-xs border-b">
                        <tr>
                            <th className="px-6 py-4 w-16 text-center">Hạng</th>
                            <th className="px-6 py-4">Tên Lái Xe</th>
                            <th className="px-6 py-4 text-center">Số Công</th>
                            <th className="px-6 py-4 text-center">Khách</th>
                            <th className="px-6 py-4 text-center">Lượt</th>
                            <th className="px-6 py-4">Danh Hiệu Vui</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredDrivers.map((d, i) => {
                            let title = "";
                            if (d.totalCong >= 28) title = "🏎️ Chiến Thần Xa Lộ";
                            else if (d.totalCong >= 26) title = "🦸‍♂️ Siêu Nhân";
                            else if (d.totalCong >= 24) title = "🐝 Ong Chúa";
                            else if (d.totalCong >= KPI_CONG_TARGET) title = "✅ Đạt Chuẩn";
                            else if (d.totalCong < 5) title = "🌱 Mầm Non / Tập Sự";
                            
                            const isTop = i < 3;
                            
                            return (
                                <tr key={i} className={`hover:bg-gray-50 ${isTop ? 'bg-yellow-50/20' : ''}`}>
                                    <td className="px-6 py-4 text-center font-bold text-gray-400">
                                        {i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : i + 1))}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">{d.name}</td>
                                    <td className={`px-6 py-4 text-center font-bold ${sortMetric === 'CONG' ? 'text-blue-600 text-lg' : ''}`}>{d.totalCong.toFixed(1)}</td>
                                    <td className={`px-6 py-4 text-center font-bold ${sortMetric === 'PAX' ? 'text-green-600 text-lg' : ''}`}>{d.totalPax.toLocaleString()}</td>
                                    <td className={`px-6 py-4 text-center font-bold ${sortMetric === 'TRIPS' ? 'text-orange-600 text-lg' : ''}`}>{d.totalTrips.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-xs font-medium text-gray-500">
                                        {title && <span className="px-2 py-1 bg-gray-100 rounded border border-gray-200">{title}</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default HallOfFame;
