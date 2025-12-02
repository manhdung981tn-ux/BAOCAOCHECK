
import React, { useMemo } from 'react';
import { PricingStat } from '../types';
import { utils, writeFile } from 'xlsx';

interface PricingTableProps {
  data: PricingStat[];
}

const PricingTable: React.FC<PricingTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu giá vé.</div>;
  }

  // Group by "Route Group" (Bidirectional Merged)
  const groupedData = useMemo(() => {
      const groups = new Map<string, PricingStat[]>();
      data.forEach(item => {
          if (!groups.has(item.routeGroup)) groups.set(item.routeGroup, []);
          groups.get(item.routeGroup)!.push(item);
      });
      return groups;
  }, [data]);

  // --- Calculate Special Stats ---
  const totalRevenueAll = data.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalTicketsAll = data.reduce((sum, item) => sum + item.quantity, 0);

  // 1. Aggregating Student Tickets (Matches "Vé Sinh Viên" prefix -> Covers both 90k and 70k)
  const studentTickets = data.filter(d => d.ticketType.toLowerCase().includes('sinh viên')).reduce((s, i) => s + i.quantity, 0);
  
  // Breakdown for Student Tickets
  const studentTransit = data.filter(d => d.ticketType.includes('Kèm Trung Chuyển')).reduce((s, i) => s + i.quantity, 0); // 90k
  const studentRegular = data.filter(d => d.ticketType.includes('Thường') && d.ticketType.includes('Sinh Viên')).reduce((s, i) => s + i.quantity, 0); // 70k

  // 2. Aggregating Taxi/Bus Users (Regular 100k + Student 90k)
  // Regular Customers using Taxi/Bus (100k)
  const regularTransit = data.filter(d => d.ticketType === 'Khách sử dụng trung chuyển (Taxi/Bus)').reduce((s, i) => s + i.quantity, 0);
  
  // Total Taxi/Bus Users = Regular Transit + Student Transit
  const totalTaxiBusUsers = regularTransit + studentTransit;

  const handleExport = () => {
      const exportData = data.map(d => ({
          "Tuyến (Gộp)": d.routeGroup,
          "Loại Vé": d.ticketType,
          "Mức Giá Vé": d.price,
          "Số Lượng Vé": d.quantity,
          "Tổng Doanh Thu": d.totalRevenue
      }));
      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Phan_Loai_Gia_Ve");
      writeFile(wb, `Bao_Cao_Gia_Ve_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
        {/* Summary Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase">Tổng Doanh Thu</p>
                    <p className="text-xl font-bold text-gray-800">{totalRevenueAll.toLocaleString('vi-VN')}</p>
                </div>
            </div>
            
            {/* Special Stats */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase">Khách Dùng Taxi/Bus</p>
                    <p className="text-xl font-bold text-indigo-700">{totalTaxiBusUsers.toLocaleString('vi-VN')}</p>
                    <p className="text-[10px] text-gray-400">({regularTransit} khách + {studentTransit} SV)</p>
                </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase">Tổng Vé Sinh Viên</p>
                    <p className="text-xl font-bold text-orange-700">{studentTickets.toLocaleString('vi-VN')}</p>
                    <p className="text-[10px] text-gray-400">({studentTransit} trung chuyển + {studentRegular} thường)</p>
                </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                </div>
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase">Tổng Vé Bán</p>
                    <p className="text-xl font-bold text-gray-800">{totalTicketsAll.toLocaleString('vi-VN')}</p>
                </div>
            </div>
        </div>

        <div className="flex justify-end">
            <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Xuất Báo Cáo
            </button>
        </div>

        {/* Grouped Table */}
        <div className="space-y-8">
            {Array.from(groupedData.entries()).map(([routeGroup, items]) => {
                const routeTotalRev = items.reduce((s, i) => s + i.totalRevenue, 0);
                const routeTotalQty = items.reduce((s, i) => s + i.quantity, 0);

                // Prepare Chart Data
                const colors = ['#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#6366f1'];
                const sortedItems = [...items].sort((a,b) => b.quantity - a.quantity).map((item, idx) => ({
                    ...item,
                    color: colors[idx % colors.length]
                }));

                // Calculate Gradients
                let curDegQty = 0;
                const gradientQty = sortedItems.map(item => {
                    const deg = (item.quantity / routeTotalQty) * 360;
                    const str = `${item.color} ${curDegQty}deg ${curDegQty + deg}deg`;
                    curDegQty += deg;
                    return str;
                }).join(', ');

                let curDegRev = 0;
                const gradientRev = sortedItems.map(item => {
                    const deg = (item.totalRevenue / routeTotalRev) * 360;
                    const str = `${item.color} ${curDegRev}deg ${curDegRev + deg}deg`;
                    curDegRev += deg;
                    return str;
                }).join(', ');

                return (
                    <div key={routeGroup} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>
                                {routeGroup}
                            </h3>
                            <div className="text-sm font-medium text-gray-600">
                                {routeTotalQty.toLocaleString('vi-VN')} vé - <span className="text-purple-700 font-bold">{routeTotalRev.toLocaleString('vi-VN')}đ</span>
                            </div>
                        </div>

                        {/* Chart Visualization Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 border-b border-gray-100">
                            {/* Quantity Distribution */}
                            <div className="flex items-center gap-6">
                                <div className="relative w-32 h-32 shrink-0">
                                    <div className="w-full h-full rounded-full shadow-sm" style={{ background: `conic-gradient(${gradientQty})`, maskImage: 'radial-gradient(transparent 55%, black 56%)', WebkitMaskImage: 'radial-gradient(transparent 55%, black 56%)' }}></div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-gray-500 font-medium">SL Vé</div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Phân Bổ Số Lượng</h4>
                                    {sortedItems.slice(0,4).map((item, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{background: item.color}}></div>
                                                <span className="truncate max-w-[120px]" title={item.ticketType}>{item.ticketType}</span>
                                            </div>
                                            <span className="font-bold text-gray-700">{item.quantity} <span className="text-gray-400 font-normal">({((item.quantity/routeTotalQty)*100).toFixed(0)}%)</span></span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Revenue Distribution */}
                            <div className="flex items-center gap-6">
                                <div className="relative w-32 h-32 shrink-0">
                                    <div className="w-full h-full rounded-full shadow-sm" style={{ background: `conic-gradient(${gradientRev})`, maskImage: 'radial-gradient(transparent 55%, black 56%)', WebkitMaskImage: 'radial-gradient(transparent 55%, black 56%)' }}></div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-gray-500 font-medium">D.Thu</div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tỷ Trọng Doanh Thu</h4>
                                    {sortedItems.slice(0,4).map((item, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{background: item.color}}></div>
                                                <span className="truncate max-w-[120px]">{new Intl.NumberFormat('vi-VN', {notation: "compact"}).format(item.price)}</span>
                                            </div>
                                            <span className="font-bold text-purple-700">{new Intl.NumberFormat('vi-VN', {notation: "compact"}).format(item.totalRevenue)} <span className="text-gray-400 font-normal">({((item.totalRevenue/routeTotalRev)*100).toFixed(0)}%)</span></span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <table className="w-full text-left text-sm text-gray-700">
                            <thead className="bg-white border-b text-gray-500 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 w-48">Phân Loại Khách</th>
                                    <th className="px-6 py-3">Mức Giá Vé</th>
                                    <th className="px-6 py-3 text-center">Số Lượng</th>
                                    <th className="px-6 py-3">Tỷ Trọng (Tuyến)</th>
                                    <th className="px-6 py-3 text-right">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedItems.map((item, idx) => {
                                    const pct = (item.quantity / routeTotalQty) * 100;
                                    
                                    // Badge Color
                                    let badgeClass = "bg-gray-100 text-gray-700";
                                    if (item.ticketType.includes('Sinh viên') || item.ticketType.includes('Sinh Viên')) badgeClass = "bg-orange-100 text-orange-700 border border-orange-200";
                                    if (item.ticketType.includes('Taxi/Bus') && !item.ticketType.includes('Sinh')) badgeClass = "bg-indigo-100 text-indigo-700 border border-indigo-200";

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: item.color}}></div>
                                                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${badgeClass}`}>
                                                        {item.ticketType}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 font-bold text-gray-800">{item.price.toLocaleString('vi-VN')}đ</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="inline-block px-3 py-1 bg-white border border-gray-200 rounded-lg font-bold text-gray-900 text-xs shadow-sm">
                                                    {item.quantity.toLocaleString('vi-VN')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 w-1/4">
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                                                        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: item.color }}></div>
                                                    </div>
                                                    <span className="w-10 text-right">{pct.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right font-bold text-purple-700">{item.totalRevenue.toLocaleString('vi-VN')}đ</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    </div>
  );
};

export default PricingTable;
