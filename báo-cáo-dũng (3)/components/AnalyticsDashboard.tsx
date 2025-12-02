
import React, { useMemo } from 'react';
import { CustomerStat, DriverStat, TransitStat, InvoiceItem, PricingStat } from '../types';
import { utils, writeFile } from 'xlsx';

interface AnalyticsDashboardProps {
  driverData: DriverStat[];
  dailyCustomerData: CustomerStat[];
  selfCustomerData: CustomerStat[];
  transitData: TransitStat[];
  invoiceData: InvoiceItem[];
  pricingData?: PricingStat[];
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  driverData,
  dailyCustomerData,
  selfCustomerData,
  transitData,
  invoiceData,
  pricingData = [] 
}) => {

  // --- 1. Calculate KPI Totals ---
  const kpi = useMemo(() => {
    // Passengers
    const dailyPax = dailyCustomerData.reduce((s, i) => s + i.customerCount, 0);
    const selfPax = selfCustomerData.reduce((s, i) => s + i.customerCount, 0);
    const transitPax = transitData.reduce((s, i) => s + i.passengerCount, 0);
    const totalPax = dailyPax + selfPax + transitPax;

    // Trips
    const driverTrips = driverData.reduce((s, i) => s + i.tripCount, 0);
    const dailyTrips = dailyCustomerData.reduce((s, i) => s + (i.tripCount || 0), 0);
    const transitTrips = transitData.reduce((s, i) => s + (i.tripCount || 0), 0);
    const totalTrips = Math.max(driverTrips, dailyTrips + transitTrips); 

    // Revenue
    const vatRevenue = invoiceData.reduce((s, i) => s + i.realAmount, 0);
    const pricingRevenue = pricingData.reduce((s, i) => s + i.totalRevenue, 0);
    const totalRevenue = vatRevenue > 0 ? vatRevenue : pricingRevenue;

    // Active Drivers
    const drivers = new Set<string>();
    driverData.forEach(d => drivers.add(d.driverName.toLowerCase()));
    dailyCustomerData.forEach(d => drivers.add(d.driverName.toLowerCase()));
    transitData.forEach(d => drivers.add(d.driverName.toLowerCase()));
    
    return {
        totalPax,
        dailyPax,
        selfPax,
        transitPax,
        totalTrips,
        totalRevenue,
        activeDrivers: drivers.size
    };
  }, [driverData, dailyCustomerData, selfCustomerData, transitData, invoiceData, pricingData]);

  // --- 2. Customer Distribution Chart Data ---
  const distribution = [
      { label: 'Tổng Khách Hàng Ngày', value: kpi.dailyPax, color: 'bg-green-500', text: 'text-green-600' },
      { label: 'Nguồn: Lái Xe Tự Khai Thác', value: kpi.selfPax, color: 'bg-teal-500', text: 'text-teal-600' },
      { label: 'Loại Vé Trung Chuyển', value: kpi.transitPax, color: 'bg-cyan-500', text: 'text-cyan-600' }
  ].filter(d => d.value > 0);
  
  // --- 3. Price Classification BY ROUTE ---
  const routePriceStats = useMemo(() => {
      // Helper to process a list of items into stats
      const processItems = (items: PricingStat[] | InvoiceItem[], isPricing: boolean) => {
          const map = new Map<string, { count: number, price: number, type: string }>();
          
          items.forEach(item => {
              if (isPricing) {
                  const p = item as PricingStat;
                  const key = `${p.ticketType} (${(p.price/1000).toFixed(0)}k)`;
                  if (!map.has(key)) map.set(key, { count: 0, price: p.price, type: p.ticketType });
                  map.get(key)!.count += p.quantity;
              } else {
                  const v = item as InvoiceItem;
                  if (v.realAmount > 0) {
                      const key = `Vé Thường (${(v.realAmount/1000).toFixed(0)}k)`;
                      if (!map.has(key)) map.set(key, { count: 0, price: v.realAmount, type: 'Vé Thường' });
                      map.get(key)!.count += 1;
                  }
              }
          });

          const totalCount = Array.from(map.values()).reduce((s, i) => s + i.count, 0);
          
          // Colors
          const getColors = (type: string, idx: number) => {
              if(type.includes('Sinh viên') || type.includes('Sinh Viên')) return '#f97316'; // Orange
              if(type.includes('Taxi')) return '#6366f1'; // Indigo
              const defaults = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#ec4899', '#ef4444'];
              return defaults[idx % defaults.length];
          };

          const stats = Array.from(map.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map((item, idx) => ({
                label: item.type,
                price: item.price,
                count: item.count,
                percentage: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
                color: getColors(item.type, idx)
            }));

          // Generate Gradient
          let currentDeg = 0;
          const gradient = stats.map(p => {
              const deg = (p.percentage / 100) * 360;
              const str = `${p.color} ${currentDeg}deg ${currentDeg + deg}deg`;
              currentDeg += deg;
              return str;
          }).join(', ');

          return { stats, totalCount, gradient };
      };

      if (pricingData.length > 0) {
          const groups = new Map<string, PricingStat[]>();
          pricingData.forEach(p => {
              if (!groups.has(p.routeGroup)) groups.set(p.routeGroup, []);
              groups.get(p.routeGroup)!.push(p);
          });

          return Array.from(groups.entries()).map(([routeName, items]) => ({
              title: routeName,
              ...processItems(items, true)
          }));
      }

      if (invoiceData.length > 0) {
          return [{
              title: "Tổng Hợp Tất Cả Tuyến (Theo VAT)",
              ...processItems(invoiceData, false)
          }];
      }

      return [];
  }, [invoiceData, pricingData]);

  
  // --- 5. Export ---
  const handleExport = () => {
      const kpiData = [
          { "Chỉ Số": "Tổng Doanh Thu", "Giá Trị": kpi.totalRevenue },
          { "Chỉ Số": "Tổng Lượng Khách", "Giá Trị": kpi.totalPax },
          { "Chỉ Số": "Tổng Lượt Xe", "Giá Trị": kpi.totalTrips },
      ];
      
      const wb = utils.book_new();
      utils.book_append_sheet(wb, utils.json_to_sheet(kpiData), "Tong_Quan_KPI");
      writeFile(wb, `Bao_Cao_Tong_Hop_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight flex items-center gap-2">
                    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Báo Cáo Tổng Hợp
                </h1>
                <p className="text-sm text-gray-500">Tổng quan hoạt động kinh doanh Hà Lan Buslines</p>
            </div>
            <div className="flex items-center gap-3">
                {kpi.totalPax > 0 && (
                    <button onClick={handleExport} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2 text-sm transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Xuất Báo Cáo
                    </button>
                )}
            </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 shadow-lg text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-30 transition-opacity transform rotate-12 scale-150">
                    <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39h-2.01c-.06-1.06-.79-1.46-2.15-1.46-1.94 0-2.02 1.05-2.02 1.72 0 .53.26 1.36 2.66 1.94 2.27.6 4.36 1.87 4.36 3.66.01 1.8-1.45 2.85-3.12 3.21z"/></svg>
                </div>
                <p className="text-indigo-200 font-medium text-sm uppercase tracking-wide mb-1">Doanh Thu</p>
                <h3 className="text-3xl font-extrabold">{kpi.totalRevenue > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(kpi.totalRevenue) : '--'}</h3>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group hover:border-green-300 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">Tổng Hợp</span>
                </div>
                <p className="text-gray-500 font-medium text-sm">Tổng Lượng Khách</p>
                <h3 className="text-3xl font-extrabold text-gray-900">{kpi.totalPax.toLocaleString('vi-VN')}</h3>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group hover:border-blue-300 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">Hoạt Động</span>
                </div>
                <p className="text-gray-500 font-medium text-sm">Tổng Lượt Xe</p>
                <h3 className="text-3xl font-extrabold text-gray-900">{kpi.totalTrips.toLocaleString('vi-VN')}</h3>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group hover:border-orange-300 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">Nhân Sự</span>
                </div>
                <p className="text-gray-500 font-medium text-sm">Tài Xế Hoạt Động</p>
                <h3 className="text-3xl font-extrabold text-gray-900">{kpi.activeDrivers}</h3>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Visual Charts */}
            <div className="space-y-8">
                
                {/* 1. Ticket Price Donut Charts */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-purple-600 rounded-full"></span>
                        Phân Loại Giá Vé & Loại Khách
                    </h3>
                    
                    {routePriceStats.length > 0 ? (
                        <div className="space-y-12">
                            {routePriceStats.map((group, idx) => (
                                <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <h4 className="text-md font-bold text-purple-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                        {group.title}
                                    </h4>
                                    
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                                        {/* Chart */}
                                        <div className="relative w-48 h-48 shrink-0 group">
                                            <div 
                                                className="w-full h-full rounded-full shadow-md transition-transform transform group-hover:scale-105 duration-500"
                                                style={{ 
                                                    background: `conic-gradient(${group.gradient})`,
                                                    maskImage: 'radial-gradient(transparent 55%, black 56%)',
                                                    WebkitMaskImage: 'radial-gradient(transparent 55%, black 56%)'
                                                }}
                                            ></div>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-[10px] text-gray-400 font-medium uppercase">Tổng Vé</span>
                                                <span className="text-xl font-bold text-gray-800">{group.totalCount.toLocaleString()}</span>
                                            </div>
                                        </div>

                                        {/* Legend */}
                                        <div className="flex-1 grid grid-cols-1 gap-2 w-full">
                                            {group.stats.map((p, i) => (
                                                <div key={i} className="flex items-center justify-between p-1.5 rounded hover:bg-white hover:shadow-sm transition-all">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }}></div>
                                                        <div className="min-w-0">
                                                            <span className="font-bold text-gray-700 text-xs block leading-tight truncate">{p.label}</span>
                                                            <span className="text-[10px] text-gray-500">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits:0 }).format(p.price)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right pl-2">
                                                        <div className="font-bold text-gray-900 text-xs">{p.count.toLocaleString()}</div>
                                                        <div className="text-[9px] text-gray-400">{p.percentage.toFixed(1)}%</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 italic bg-gray-50 rounded-xl p-12 border border-dashed border-gray-200">
                            <svg className="w-12 h-12 mb-3 opacity-50 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                            <p>Chưa có dữ liệu giá vé (Nhập Phân Loại Giá Vé hoặc Đối Soát VAT).</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Other Stats */}
            <div className="space-y-6">
                {/* 2. Customer Sources Distribution */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                        Nguồn Khách & Loại Vé
                    </h3>
                    
                    {distribution.length > 0 ? (
                        <div className="space-y-6">
                            {distribution.map((d, i) => (
                                <div key={i} className="group">
                                    <div className="flex justify-between text-sm font-medium mb-2">
                                        <span className="text-gray-700 flex items-center gap-2">
                                            {i===0 && <span className="text-lg">📅</span>}
                                            {i===1 && <span className="text-lg">🤝</span>}
                                            {i===2 && <span className="text-lg">🚌</span>}
                                            {d.label}
                                        </span>
                                        <span className={`${d.text} font-bold`}>{d.value.toLocaleString()} <span className="text-xs text-gray-400 font-normal">({((d.value/kpi.totalPax)*100).toFixed(1)}%)</span></span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full ${d.color} rounded-full transition-all duration-1000 ease-out relative group-hover:opacity-80`} 
                                            style={{ width: `${(d.value / kpi.totalPax) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 italic bg-gray-50 rounded-xl p-8">Chưa có dữ liệu</div>
                    )}
                </div>
                
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                    <h3 className="text-lg font-bold text-indigo-900 mb-4">💡 Gợi Ý Quản Lý</h3>
                    <ul className="space-y-2 text-sm text-indigo-700">
                        <li className="flex items-start gap-2">
                            <span>✅</span>
                            Hãy kiểm tra <strong>Bảng Vinh Danh</strong> để xem đánh giá hiệu suất lái xe.
                        </li>
                        <li className="flex items-start gap-2">
                            <span>✅</span>
                            Sử dụng <strong>Đối Soát VAT</strong> để phát hiện vé xuất lệch giá.
                        </li>
                        <li className="flex items-start gap-2">
                            <span>✅</span>
                            Theo dõi biểu đồ giá vé để tối ưu doanh thu các tuyến trọng điểm.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
  );
};

export default AnalyticsDashboard;
