
import React, { useState } from 'react';
import { InvoiceItem } from '../types';
import { utils, writeFile } from 'xlsx';

interface RevenueTableProps {
  data: InvoiceItem[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const RevenueTable: React.FC<RevenueTableProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'RECONCILE' | 'REAL' | 'INVOICE'>('RECONCILE');
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  if (!data || data.length === 0) {
    return <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có dữ liệu hóa đơn.</div>;
  }

  // Calculate Aggregates
  const totalReal = data.reduce((sum, item) => sum + item.realAmount, 0);
  const totalInvoice = data.reduce((sum, item) => sum + item.invoiceAmount, 0);
  
  // Count stats based on notes (Status)
  const missingInvoiceCount = data.filter(i => i.notes && i.notes.includes('THIẾU')).length;
  const extraInvoiceCount = data.filter(i => i.notes && i.notes.includes('THỪA')).length;
  const diffPriceCount = data.filter(i => i.notes && i.notes.includes('LỆCH')).length;
  const matchCount = data.filter(i => i.notes && i.notes.includes('KHỚP')).length;

  // Visualization Percentages
  const totalItems = data.length || 1;
  const matchPct = (matchCount / totalItems) * 100;
  const missPct = (missingInvoiceCount / totalItems) * 100;
  const extraPct = (extraInvoiceCount / totalItems) * 100;
  const diffPct = (diffPriceCount / totalItems) * 100;

  // Filter lists for specific tabs
  const realRevenueList = data.filter(item => item.realAmount > 0);
  const invoiceList = data.filter(item => item.invoiceAmount > 0);

  // Filter for Reconciliation View
  const reconcileList = showDiffOnly 
    ? data.filter(item => item.notes && !item.notes.includes('KHỚP'))
    : data;

  const handleExport = () => {
    const exportData = data.map(item => {
        const diff = item.realAmount - item.invoiceAmount;
        return {
            "Mã Vé": item.ticketCode,
            "Ngày": item.tripDate,
            "Giá Tiền Thực Tế": item.realAmount,
            "Giá Tiền Hóa Đơn": item.invoiceAmount,
            "Chênh Lệch": diff,
            "Trạng Thái": item.notes 
        };
    });

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Doi_Soat_VAT");
    
    const date = new Date().toISOString().slice(0,10);
    writeFile(wb, `Bao_Cao_VAT_Chi_Tiet_${date}.xlsx`);
  };

  // Chart Data prep
  const maxVal = Math.max(totalReal, totalInvoice);
  const realHeight = maxVal > 0 ? (totalReal / maxVal) * 100 : 0;
  const invHeight = maxVal > 0 ? (totalInvoice / maxVal) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Health Bar Visualization */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sức Khỏe Đối Soát</h4>
        <div className="w-full h-4 bg-gray-100 rounded-full flex overflow-hidden">
            <div style={{ width: `${matchPct}%` }} className="bg-green-500" title={`Khớp: ${matchCount}`}></div>
            <div style={{ width: `${missPct}%` }} className="bg-red-500" title={`Thiếu: ${missingInvoiceCount}`}></div>
            <div style={{ width: `${extraPct}%` }} className="bg-orange-500" title={`Thừa: ${extraInvoiceCount}`}></div>
            <div style={{ width: `${diffPct}%` }} className="bg-yellow-400" title={`Lệch giá: ${diffPriceCount}`}></div>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Khớp ({matchCount})</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Thiếu ({missingInvoiceCount})</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Thừa ({extraInvoiceCount})</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Lệch ({diffPriceCount})</div>
        </div>
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between h-full">
          <div className="text-xs text-gray-500 font-medium mb-1">TỔNG VÉ XỬ LÝ</div>
          <div className="text-2xl font-bold text-gray-900">{data.length}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-xl shadow-sm border border-green-100 flex flex-col justify-between h-full">
          <div className="text-xs text-green-700 font-medium mb-1">KHỚP ĐỦ</div>
          <div className="text-2xl font-bold text-green-700">{matchCount}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-xl shadow-sm border border-red-100 flex flex-col justify-between h-full">
           <div className="text-xs text-red-700 font-medium mb-1">THIẾU HÓA ĐƠN</div>
           <div className="text-2xl font-bold text-red-700">{missingInvoiceCount}</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-xl shadow-sm border border-orange-100 flex flex-col justify-between h-full">
           <div className="text-xs text-orange-700 font-medium mb-1">THỪA HÓA ĐƠN</div>
           <div className="text-2xl font-bold text-orange-700">{extraInvoiceCount}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-xl shadow-sm border border-yellow-100 flex flex-col justify-between h-full">
           <div className="text-xs text-yellow-800 font-medium mb-1">LỆCH GIÁ</div>
           <div className="text-2xl font-bold text-yellow-700">{diffPriceCount}</div>
        </div>
      </div>

      {/* Navigation Tabs & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 bg-white rounded-t-xl px-2 pt-2">
        <div className="flex gap-1 overflow-x-auto">
            <button
                onClick={() => setActiveTab('RECONCILE')}
                className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition-colors border-t border-x border-transparent whitespace-nowrap ${
                    activeTab === 'RECONCILE' 
                    ? 'bg-white text-indigo-700 border-gray-200 border-b-white -mb-px relative z-10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
                Kết Quả Đối Soát
            </button>
            <button
                onClick={() => setActiveTab('REAL')}
                className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition-colors border-t border-x border-transparent whitespace-nowrap ${
                    activeTab === 'REAL' 
                    ? 'bg-white text-orange-700 border-gray-200 border-b-white -mb-px relative z-10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
                Dữ Liệu Thực Tế
            </button>
            <button
                onClick={() => setActiveTab('INVOICE')}
                className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition-colors border-t border-x border-transparent whitespace-nowrap ${
                    activeTab === 'INVOICE' 
                    ? 'bg-white text-blue-700 border-gray-200 border-b-white -mb-px relative z-10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
                Dữ Liệu Hóa Đơn
            </button>
        </div>

        {activeTab === 'RECONCILE' && (
            <div className="flex gap-2 mb-3 px-2 md:px-0">
                <button 
                    onClick={() => setShowDiffOnly(!showDiffOnly)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showDiffOnly ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    {showDiffOnly ? 'Đang lọc lỗi' : 'Lọc lỗi'}
                </button>
                <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Xuất Excel
                </button>
            </div>
        )}
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 border-t-0 overflow-hidden relative min-h-[400px]">
        {activeTab === 'RECONCILE' && (
            <div className="animate-fade-in">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-gray-700 relative">
                        <thead className="bg-gray-50 font-semibold border-b text-gray-500 uppercase text-xs tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 border-r w-32 bg-gray-50">Mã Vé</th>
                            <th className="px-4 py-3 border-r w-24 bg-gray-50">Ngày</th>
                            <th className="px-4 py-3 text-right border-r bg-gray-50 text-gray-600">Giá Tiền Thực Tế</th>
                            <th className="px-4 py-3 text-right border-r bg-gray-50 text-gray-600">Giá Tiền Hóa Đơn</th>
                            <th className="px-4 py-3 w-40 bg-gray-50">Trạng Thái</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {reconcileList.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Không tìm thấy vé nào theo bộ lọc.</td></tr>
                        ) : (
                            reconcileList.map((row, index) => {
                                const diff = row.realAmount - row.invoiceAmount;
                                const isMissing = row.notes?.includes('THIẾU');
                                const isExtra = row.notes?.includes('THỪA');
                                const isDiff = row.notes?.includes('LỆCH');
                                
                                let badgeColor = "bg-green-100 text-green-800 border-green-200";
                                if (isMissing) badgeColor = "bg-red-100 text-red-800 border-red-200";
                                else if (isExtra) badgeColor = "bg-orange-100 text-orange-800 border-orange-200";
                                else if (isDiff) badgeColor = "bg-yellow-100 text-yellow-800 border-yellow-200";

                                return (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-mono font-medium text-gray-900 border-r">{row.ticketCode}</td>
                                    <td className="px-4 py-3 text-gray-500 border-r text-xs">{row.tripDate || '-'}</td>
                                    <td className="px-4 py-3 text-right font-medium border-r text-gray-900">{row.realAmount > 0 ? formatCurrency(row.realAmount) : '-'}</td>
                                    <td className="px-4 py-3 text-right font-medium border-r text-gray-900">{row.invoiceAmount > 0 ? formatCurrency(row.invoiceAmount) : '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold border ${badgeColor}`}>
                                            {row.notes}
                                        </span>
                                    </td>
                                </tr>
                                );
                            })
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {(activeTab === 'REAL' || activeTab === 'INVOICE') && (
             <div className="animate-fade-in">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-gray-700">
                        <thead className="bg-gray-50 font-semibold border-b text-gray-500 uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-3 border-r w-40">Mã Vé</th>
                                <th className="px-6 py-3 border-r w-32">Ngày</th>
                                <th className="px-6 py-3 text-right w-40">Số Tiền {activeTab === 'REAL' ? 'Thực Tế' : 'Hóa Đơn'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(activeTab === 'REAL' ? realRevenueList : invoiceList).map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-3 font-mono font-medium text-gray-900 border-r">{row.ticketCode}</td>
                                    <td className="px-6 py-3 text-gray-500 border-r">{row.tripDate || '-'}</td>
                                    <td className="px-6 py-3 text-right font-bold text-gray-800">
                                        {formatCurrency(activeTab === 'REAL' ? row.realAmount : row.invoiceAmount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
        )}
      </div>
      
      {/* Financial Chart Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row gap-12 items-center justify-center">
               <div className="flex items-end gap-16 h-48 relative w-full md:w-1/2 justify-center border-b border-gray-200 pb-2">
                   <div className="flex flex-col items-center gap-2 w-24">
                        <span className="text-orange-700 font-bold text-xs">{formatCurrency(totalReal)}</span>
                        <div className="w-full bg-orange-500 rounded-t-lg shadow-md" style={{ height: `${Math.max(realHeight, 5)}%` }}></div>
                        <span className="text-gray-500 text-xs font-bold mt-1">THỰC TẾ</span>
                   </div>
                   <div className="flex flex-col items-center gap-2 w-24">
                        <span className="text-blue-700 font-bold text-xs">{formatCurrency(totalInvoice)}</span>
                        <div className="w-full bg-blue-500 rounded-t-lg shadow-md" style={{ height: `${Math.max(invHeight, 5)}%` }}></div>
                        <span className="text-gray-500 text-xs font-bold mt-1">HÓA ĐƠN</span>
                   </div>
               </div>
          </div>
      </div>
    </div>
  );
};

export default RevenueTable;
