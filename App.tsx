import React, { Component, useState, useRef, useEffect, lazy, Suspense, ReactNode } from 'react';
import { ViewState, DriverStat, CustomerStat, InvoiceItem, PhoneStat, TransitStat, PricingStat } from './types';
// Remove AI Service import
// import { analyzeReport } from './services/geminiService'; 
import { reconcileVATLocal } from './services/vatService';
import { processSelfCustomersLocal } from './services/customerService';
import { processDailyCustomersLocal } from './services/dailyCustomerService';
import { processPricingStatsLocal } from './services/pricingService'; // Changed from driverService
import { processPhoneStatsLocal } from './services/phoneService'; 
import { processTransitStatsLocal } from './services/transitService'; 
import { read, utils } from 'xlsx';

// --- Lazy Load Components for Performance ---
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard')); 
const HallOfFame = lazy(() => import('./components/HallOfFame')); // New Component
const PricingTable = lazy(() => import('./components/PricingTable')); // Changed from DriverTable
const CustomerTable = lazy(() => import('./components/CustomerTable'));
const RevenueTable = lazy(() => import('./components/RevenueTable'));
const PhoneTable = lazy(() => import('./components/PhoneTable')); 
const TransitTable = lazy(() => import('./components/TransitTable')); 

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-12 text-center text-red-600 bg-red-50 rounded-xl border border-red-200 m-8 shadow-sm">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <h3 className="text-lg font-bold">Đã xảy ra lỗi hiển thị</h3>
          <p className="text-sm mt-2 text-red-500">Ứng dụng gặp sự cố khi hiển thị dữ liệu này. Vui lòng thử tải lại trang.</p>
          <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">
            Tải lại trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Loading Fallback ---
const LoadingSkeleton = () => (
    <div className="animate-pulse space-y-4 p-6">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-3 gap-4">
            <div className="h-32 bg-gray-200 rounded-xl"></div>
            <div className="h-32 bg-gray-200 rounded-xl"></div>
            <div className="h-32 bg-gray-200 rounded-xl"></div>
        </div>
        <div className="h-64 bg-gray-200 rounded-xl"></div>
    </div>
);

// --- Helpers ---

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const processExcelFile = (file: File, raw: boolean = false): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file); 

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
            reject(new Error("File rỗng hoặc không thể đọc."));
            return;
        }

        const workbook = read(data, { 
            type: 'array',
            dense: true,
            cellDates: true,
            cellFormula: false,
            cellHTML: false,
            cellText: false
        });

        if (workbook.SheetNames.length === 0) {
            reject(new Error("File Excel không có Sheet nào."));
            return;
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        if (raw) {
            const jsonData = utils.sheet_to_json(worksheet, { 
                header: 1,
                defval: '',
                blankrows: false 
            });
            resolve(jsonData);
        } else {
            const jsonData = utils.sheet_to_json(worksheet, { 
                defval: '',
                blankrows: false 
            });
            resolve(jsonData);
        }
      } catch (err) {
        console.error("Excel processing error:", err);
        reject(new Error("Lỗi định dạng file Excel. Vui lòng kiểm tra lại file."));
      }
    };
    reader.onerror = () => reject(new Error("Lỗi trình duyệt khi đọc file."));
  });
};

// --- UI Components ---

const ExcelIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 13H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 17H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FilePreviewCard: React.FC<{
  file: File;
  label: string;
  onRemove: () => void;
  colorClass: string;
  iconColor: string;
}> = ({ file, label, onRemove, colorClass, iconColor }) => (
  <div className={`relative flex items-center p-4 rounded-xl border ${colorClass} bg-white shadow-sm transition-all hover:shadow-md group`}>
    <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 mr-4 ${iconColor} bg-opacity-10`}>
      <ExcelIcon className={`w-6 h-6 ${iconColor}`} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900 truncate" title={file.name}>{file.name}</p>
      <p className="text-xs text-gray-400 mt-0.5 font-mono">{formatFileSize(file.size)}</p>
    </div>
    <button 
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className="p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
      title="Gỡ bỏ file"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  </div>
);

const SingleUploadSection: React.FC<{
  onAnalyze: (data: any[], text: string) => void;
  loading: boolean;
  title: string;
  badgeLabel?: string;
  colorTheme?: 'green' | 'teal' | 'indigo' | 'pink' | 'orange' | 'cyan' | 'purple';
  isLocalProcessing?: boolean;
}> = ({ onAnalyze, loading, title, badgeLabel = "Phần Nhập Dữ Liệu", colorTheme = 'orange', isLocalProcessing = false }) => {
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = {
      green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', btn: 'bg-green-600 hover:bg-green-700', ring: 'focus:ring-green-500', icon: 'text-green-600' },
      teal: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', btn: 'bg-teal-600 hover:bg-teal-700', ring: 'focus:ring-teal-500', icon: 'text-teal-600' },
      indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', btn: 'bg-indigo-600 hover:bg-indigo-700', ring: 'focus:ring-indigo-500', icon: 'text-indigo-600' },
      pink: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', btn: 'bg-pink-600 hover:bg-pink-700', ring: 'focus:ring-pink-500', icon: 'text-pink-600' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', btn: 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700', ring: 'focus:ring-orange-500', icon: 'text-orange-600' },
      cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', btn: 'bg-cyan-600 hover:bg-cyan-700', ring: 'focus:ring-cyan-500', icon: 'text-cyan-600' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', btn: 'bg-purple-600 hover:bg-purple-700', ring: 'focus:ring-purple-500', icon: 'text-purple-600' },
  }[colorTheme];

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setIsReading(true);
    setTimeout(async () => { setIsReading(false); }, 600);
  };

  const handleAnalyzeClick = async () => {
    if (selectedFile) {
        try {
            const excelData = await processExcelFile(selectedFile, isLocalProcessing);
            onAnalyze(excelData, inputText);
        } catch (error) {
            alert(error instanceof Error ? error.message : "Lỗi đọc file");
        }
    } else {
        onAnalyze([], inputText);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in py-8">
        <div className="text-center space-y-3">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${colors.bg} ${colors.text} shadow-sm`}>
                {badgeLabel}
            </span>
            <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">{title}</h2>
            <p className="text-gray-500">Tải lên file Excel (.xlsx, .xls) để hệ thống tự động xử lý.</p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-lg shadow-gray-100 border border-gray-100">
            {!selectedFile ? (
                <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group
                        ${isDragging ? `${colors.bg} ${colors.border}` : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'}`}
                >
                    <div className={`w-16 h-16 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200 ${isDragging ? 'bg-white' : ''}`}>
                         <ExcelIcon className={`w-8 h-8 ${isDragging ? colors.text : 'text-gray-400 group-hover:text-orange-500'}`} />
                    </div>
                    <p className="text-lg font-bold text-gray-700 group-hover:text-orange-700">Kéo thả file Excel vào đây</p>
                    <p className="text-sm text-gray-400 mt-2 group-hover:text-orange-500">hoặc nhấn để chọn file từ máy tính</p>
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} accept=".xlsx, .xls" className="hidden" />
                </div>
            ) : (
                <div className="space-y-6">
                    <FilePreviewCard 
                        file={selectedFile} 
                        label="File Dữ Liệu" 
                        onRemove={() => setSelectedFile(null)}
                        colorClass={`${colors.bg} ${colors.border}`}
                        iconColor={colors.icon}
                    />

                    <div className="flex justify-center pt-2">
                         <button
                            onClick={handleAnalyzeClick}
                            disabled={loading || isReading}
                            className={`px-10 py-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all hover:-translate-y-1 active:translate-y-0 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${colors.btn}`}
                        >
                            {loading || isReading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {isReading ? 'Đang đọc file...' : 'Đang xử lý...'}
                                </>
                            ) : (
                                <>
                                    <span>Bắt Đầu Xử Lý</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

const DualUploadSection: React.FC<{
  onAnalyze: (file1Data: any[], file2Data: any[]) => void;
  loading: boolean;
  config: {
    title: string;
    file1: { id: string, label: string, keywords: string[], color: string, icon: string };
    file2: { id: string, label: string, keywords: string[], color: string, icon: string };
    analyzeBtnText: string;
    analyzeBtnColor: string;
    isLocalProcessing?: boolean;
  }
}> = ({ onAnalyze, loading, config }) => {
    const [file1, setFile1] = useState<File | null>(null);
    const [file2, setFile2] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isReading, setIsReading] = useState(false);
    const file1InputRef = useRef<HTMLInputElement>(null);
    const file2InputRef = useRef<HTMLInputElement>(null);

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    
    const assignFile = (file: File) => {
        const name = file.name.toLowerCase();
        const isFile1 = config.file1.keywords.some(k => name.includes(k));
        const isFile2 = config.file2.keywords.some(k => name.includes(k));

        if (isFile1 && !isFile2) {
            setFile1(file);
        } else if (isFile2 && !isFile1) {
            setFile2(file);
        } else {
            if (!file1) setFile1(file);
            else if (!file2) setFile2(file);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files) as File[];
        if (files.length === 2) {
            setFile1(null); setFile2(null);
            files.forEach(f => assignFile(f));
        } else if (files.length === 1) {
            assignFile(files[0]);
        }
    };

    const handleAnalyzeClick = async () => {
        if (!file1 || !file2) return;
        setIsReading(true);
        try {
            const p1 = processExcelFile(file1, config.isLocalProcessing);
            const p2 = processExcelFile(file2, config.isLocalProcessing);
            const [d1, d2] = await Promise.all([p1, p2]);
            onAnalyze(d1, d2);
        } catch (error) {
            alert(error instanceof Error ? error.message : "Lỗi đọc file");
        } finally {
            setIsReading(false);
        }
    };

    const swapFiles = () => {
        const temp = file1; setFile1(file2); setFile2(temp);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in py-8">
             <div className="text-center space-y-3">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-100 text-orange-700">
                    Phần Nhập Dữ Liệu
                </span>
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{config.title}</h2>
                <p className="text-gray-500">Vui lòng tải lên cả 2 file Excel tương ứng để hệ thống đối chiếu.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg shadow-gray-100 border border-gray-100 relative">
                {(!file1 || !file2) && (
                    <div 
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`absolute inset-0 z-10 bg-white bg-opacity-90 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-300 backdrop-blur-sm
                            ${isDragging ? 'border-orange-500 bg-orange-50 bg-opacity-90' : 'border-transparent pointer-events-none opacity-0'}`}
                    >
                         <ExcelIcon className="w-16 h-16 text-orange-500 mb-4 animate-bounce" />
                         <p className="text-xl font-bold text-orange-700">Thả 2 file vào đây ngay!</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-0">
                    <div className="space-y-3">
                         <div className="flex justify-between items-center"><label className="text-sm font-bold text-gray-700 uppercase">{config.file1.label}</label>{file1 && <button onClick={() => setFile1(null)} className="text-xs text-red-500 hover:underline">Xóa</button>}</div>
                         {!file1 ? (
                             <div onClick={() => file1InputRef.current?.click()} className={`h-40 border-2 border-dashed ${config.file1.color} border-opacity-40 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-opacity-10 transition-colors`}>
                                <div className={`p-3 rounded-full bg-opacity-10 mb-2 ${config.file1.color.replace('border-', 'bg-').replace('border-', 'text-')}`}><ExcelIcon className={`w-8 h-8 ${config.file1.icon}`} /></div>
                                <span className="text-sm text-gray-500 font-medium text-center px-4">Chọn file {config.file1.label}</span>
                             </div>
                         ) : (
                             <FilePreviewCard file={file1} label={config.file1.label} onRemove={() => setFile1(null)} colorClass={`${config.file1.color} bg-opacity-5`} iconColor={config.file1.icon} />
                         )}
                         <input type="file" ref={file1InputRef} onChange={(e) => e.target.files?.[0] && setFile1(e.target.files[0])} accept=".xlsx, .xls" className="hidden" />
                    </div>

                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 hidden md:flex z-20">
                        <button onClick={swapFiles} className="p-3 bg-white border border-gray-200 shadow-md rounded-full text-gray-400 hover:text-orange-600 hover:scale-110 transition-all" title="Đổi vị trí 2 file"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg></button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center"><label className="text-sm font-bold text-gray-700 uppercase">{config.file2.label}</label>{file2 && <button onClick={() => setFile2(null)} className="text-xs text-red-500 hover:underline">Xóa</button>}</div>
                        {!file2 ? (
                             <div onClick={() => file2InputRef.current?.click()} className={`h-40 border-2 border-dashed ${config.file2.color} border-opacity-40 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-opacity-10 transition-colors`}>
                                <div className={`p-3 rounded-full bg-opacity-10 mb-2 ${config.file2.color.replace('border-', 'bg-').replace('border-', 'text-')}`}><ExcelIcon className={`w-8 h-8 ${config.file2.icon}`} /></div>
                                <span className="text-sm text-gray-500 font-medium text-center px-4">Chọn file {config.file2.label}</span>
                             </div>
                         ) : (
                             <FilePreviewCard file={file2} label={config.file2.label} onRemove={() => setFile2(null)} colorClass={`${config.file2.color} bg-opacity-5`} iconColor={config.file2.icon} />
                         )}
                         <input type="file" ref={file2InputRef} onChange={(e) => e.target.files?.[0] && setFile2(e.target.files[0])} accept=".xlsx, .xls" className="hidden" />
                    </div>
                </div>

                <div className="flex justify-center mt-10">
                    <button onClick={handleAnalyzeClick} disabled={!file1 || !file2 || loading || isReading} className={`px-10 py-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all hover:-translate-y-1 active:translate-y-0 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${config.analyzeBtnColor}`}>
                         {loading || isReading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                {isReading ? 'Đang đọc files...' : 'Đang xử lý...'}
                            </>
                        ) : (
                            <>
                                <span>{config.analyzeBtnText}</span>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewState>(ViewState.ANALYTICS); // Default to Dashboard
  const [loading, setLoading] = useState(false);
  
  const [pricingData, setPricingData] = useState<PricingStat[]>([]); // New State
  const [driverData, setDriverData] = useState<DriverStat[]>([]); // Kept for Analytics aggregation only
  const [dailyCustomerData, setDailyCustomerData] = useState<CustomerStat[]>([]);
  const [selfCustomerData, setSelfCustomerData] = useState<CustomerStat[]>([]);
  const [invoiceData, setInvoiceData] = useState<InvoiceItem[]>([]);
  const [phoneData, setPhoneData] = useState<PhoneStat[]>([]);
  const [transitData, setTransitData] = useState<TransitStat[]>([]); 

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // VAT Config definition
  const vatConfig = {
      title: "Đối Soát Doanh Thu & Hóa Đơn",
      file1: {
          id: 'real',
          label: 'File Doanh Thu Thực Tế',
          keywords: ['thuc', 'real', 'doanh thu'],
          color: 'border-orange-400',
          icon: 'text-orange-600'
      },
      file2: {
          id: 'invoice',
          label: 'File Hóa Đơn VAT',
          keywords: ['invoice', 'vat', 'hoa don'],
          color: 'border-blue-400',
          icon: 'text-blue-600'
      },
      analyzeBtnText: 'Thực Hiện Đối Soát',
      analyzeBtnColor: 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700',
      isLocalProcessing: true
  };

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Persistence Effects
  useEffect(() => {
    const savedDaily = localStorage.getItem('dailyCustomerData');
    if (savedDaily) { try { setDailyCustomerData(JSON.parse(savedDaily)); } catch (e) { console.error(e); } }
    
    const savedSelf = localStorage.getItem('selfCustomerData');
    if (savedSelf) { try { setSelfCustomerData(JSON.parse(savedSelf)); } catch (e) { console.error(e); } }

    const savedTransit = localStorage.getItem('transitData');
    if (savedTransit) { try { setTransitData(JSON.parse(savedTransit)); } catch (e) { console.error(e); } }
  }, []);

  useEffect(() => { localStorage.setItem('dailyCustomerData', JSON.stringify(dailyCustomerData)); }, [dailyCustomerData]);
  useEffect(() => { localStorage.setItem('selfCustomerData', JSON.stringify(selfCustomerData)); }, [selfCustomerData]);
  useEffect(() => { localStorage.setItem('transitData', JSON.stringify(transitData)); }, [transitData]);

  const handleAnalyze = async (data: any | any[], extraData?: any) => {
    setLoading(true);
    try {
      switch (activeTab) {
        case ViewState.TICKET_PRICING:
            const pricingStats = processPricingStatsLocal(data);
            setPricingData(pricingStats);
            break;

        case ViewState.CUSTOMER_DAILY:
            const newStats = processDailyCustomersLocal(data);
            const mergedMap = new Map<string, CustomerStat>();
            dailyCustomerData.forEach(d => { mergedMap.set(`${d.date}_${d.driverName}`, d); });
            newStats.forEach(d => { mergedMap.set(`${d.date}_${d.driverName}`, d); });
            setDailyCustomerData(Array.from(mergedMap.values()));
            break;

        case ViewState.CUSTOMER_SELF:
            const localSelfStats = processSelfCustomersLocal(data);
            const mergedSelfMap = new Map<string, CustomerStat>();
            selfCustomerData.forEach(d => { 
                const dateKey = d.date || 'Unknown';
                mergedSelfMap.set(`${dateKey}_${d.driverName}`, d); 
            });
            localSelfStats.forEach(d => { 
                const dateKey = d.date || 'Unknown';
                mergedSelfMap.set(`${dateKey}_${d.driverName}`, d); 
            });
            setSelfCustomerData(Array.from(mergedSelfMap.values()));
            break;

        case ViewState.CUSTOMER_PHONE: 
            const phoneStats = processPhoneStatsLocal(data);
            setPhoneData(phoneStats);
            break;

        case ViewState.TRANSIT_DETAILED: 
            const transitStats = processTransitStatsLocal(data);
            const mergedTransitMap = new Map<string, TransitStat>();
            transitData.forEach(d => mergedTransitMap.set(`${d.date}_${d.driverName}`, d));
            transitStats.forEach(d => mergedTransitMap.set(`${d.date}_${d.driverName}`, d));
            setTransitData(Array.from(mergedTransitMap.values()));
            break;

        case ViewState.REVENUE_VAT:
            const realData = data;
            const invData = extraData;
            const vatStats = reconcileVATLocal(realData, invData);
            setInvoiceData(vatStats);
            break;
      }
    } catch (error) {
      alert("Có lỗi xảy ra: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const clearDailyData = () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu Khách Hàng Ngày đã lưu?")) {
          setDailyCustomerData([]);
          localStorage.removeItem('dailyCustomerData');
      }
  };

  const clearSelfData = () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu Khách Tự Khai Thác đã lưu?")) {
          setSelfCustomerData([]);
          localStorage.removeItem('selfCustomerData');
      }
  };

  const clearTransitData = () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu Xe Trung Chuyển đã lưu?")) {
          setTransitData([]);
          localStorage.removeItem('transitData');
      }
  };

  const navItems = [
    { id: ViewState.ANALYTICS, label: 'Báo Cáo Tổng Hợp', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    )},
    { id: ViewState.HALL_OF_FAME, label: 'Bảng Vinh Danh', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
    )},
    { id: ViewState.TICKET_PRICING, label: 'Phân Loại Giá Vé', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
    )},
    { id: ViewState.CUSTOMER_DAILY, label: 'Khách Hàng Ngày', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    )},
    { id: ViewState.CUSTOMER_SELF, label: 'Khách Tự Khai Thác', icon: (
       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    )},
    { id: ViewState.TRANSIT_DETAILED, label: 'Xe Trung Chuyển', icon: (
       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
    )},
    { id: ViewState.CUSTOMER_PHONE, label: 'Khách Theo SĐT', icon: (
       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
    )},
    { id: ViewState.REVENUE_VAT, label: 'Đối Soát VAT', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.828 2.828a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
    )},
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-gray-200 shadow-sm z-20">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col gap-3">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-red-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-100">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </div>
                <div>
                    <h1 className="text-lg font-extrabold text-gray-800 tracking-tight leading-none uppercase">Hà Lan</h1>
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Buslines</span>
                </div>
             </div>
          </div>
        </div>
        
        <div className="px-6 py-4 flex-1 overflow-y-auto">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Menu Quản Lý</p>
            <nav className="space-y-1">
            {navItems.map((item) => (
                <button
                key={item.id}
                onClick={() => setActiveTab(item.id as ViewState)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm group relative overflow-hidden
                    ${activeTab === item.id 
                    ? 'bg-gradient-to-r from-orange-50 to-white text-orange-700 border-l-4 border-orange-500 shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'}`}
                >
                <span className={`relative z-10 transition-transform duration-200 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</span>
                <span className="relative z-10">{item.label}</span>
                </button>
            ))}
            </nav>
        </div>

        <div className="mt-auto p-6 border-t border-gray-100 bg-gray-50/50">
            <div className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">A</div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">Admin</p>
                    <p className="text-xs text-gray-400 truncate">Hà Lan Buslines</p>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute inset-0 bg-gray-50 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.5 }}></div>

        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center shadow-sm z-30 relative">
           <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-gray-800 leading-none">Hà Lan</span>
                    <span className="text-[10px] font-bold text-orange-600 uppercase">Buslines</span>
                </div>
           </div>
           <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 rounded-lg bg-gray-100 text-gray-600">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
           </button>

           {isMobileMenuOpen && (
             <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-xl p-4 flex flex-col gap-2 animate-fade-in z-40">
                {navItems.map((item) => (
                    <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as ViewState); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium
                        ${activeTab === item.id ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                     {item.icon} {item.label}
                    </button>
                ))}
             </div>
           )}
        </header>

        {/* Desktop Top Bar */}
        <div className="hidden md:flex bg-white/80 backdrop-blur-md border-b border-gray-200 px-8 py-3 justify-between items-center z-10 sticky top-0">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Hệ thống báo cáo</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="font-semibold text-gray-800">{navItems.find(i => i.id === activeTab)?.label}</span>
            </div>
            <div className="text-xs font-mono text-gray-400 font-medium">
                {currentDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative z-0 scroll-smooth">
          
          <ErrorBoundary>
          <Suspense fallback={<LoadingSkeleton />}>
            
            {activeTab === ViewState.ANALYTICS && (
               <AnalyticsDashboard 
                  driverData={driverData}
                  dailyCustomerData={dailyCustomerData}
                  selfCustomerData={selfCustomerData}
                  transitData={transitData}
                  invoiceData={invoiceData}
                  pricingData={pricingData}
               />
            )}

            {activeTab === ViewState.HALL_OF_FAME && (
               <HallOfFame
                  dailyCustomerData={dailyCustomerData}
                  transitData={transitData}
               />
            )}

            {activeTab === ViewState.TICKET_PRICING && (
                pricingData.length === 0 ? (
                    <SingleUploadSection 
                        title="Phân Loại Giá Vé Theo Tuyến" 
                        onAnalyze={handleAnalyze} 
                        loading={loading}
                        badgeLabel="Nhập dữ liệu giá"
                        colorTheme="purple"
                        isLocalProcessing={true} 
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-8 bg-purple-500 rounded-sm"></span>
                                Bảng Phân Loại Giá Vé
                            </h2>
                            <button onClick={() => setPricingData([])} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium transition-colors">Tải file khác</button>
                        </div>
                        <PricingTable data={pricingData} />
                    </div>
                )
            )}

            {activeTab === ViewState.CUSTOMER_DAILY && (
                dailyCustomerData.length === 0 ? (
                    <SingleUploadSection 
                        title="Khách Hàng Ngày" 
                        onAnalyze={handleAnalyze} 
                        loading={loading}
                        badgeLabel="Nhập dữ liệu ngày"
                        colorTheme="green"
                        isLocalProcessing={true}
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <span className="w-2 h-8 bg-green-500 rounded-sm"></span>
                                    Kết Quả Khách Hàng Ngày
                                </h2>
                                <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded-md font-medium">Đã lưu tự động</span>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file'; input.accept = '.xlsx, .xls';
                                    input.onchange = async (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if(file) { try { const data = await processExcelFile(file, true); handleAnalyze(data); } catch(err) { alert(err); } }
                                    };
                                    input.click();
                                }} className="flex-1 sm:flex-none px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm text-sm font-medium flex justify-center items-center gap-2 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Thêm File
                                </button>
                                <button onClick={clearDailyData} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 shadow-sm text-sm font-medium transition-colors">Xóa Dữ Liệu</button>
                            </div>
                        </div>
                        <CustomerTable data={dailyCustomerData} title="Chi Tiết Khách Hàng Ngày" colorTheme="green" />
                    </div>
                )
            )}

            {activeTab === ViewState.CUSTOMER_SELF && (
                selfCustomerData.length === 0 ? (
                    <SingleUploadSection 
                        title="Khách Tự Khai Thác" 
                        onAnalyze={handleAnalyze} 
                        loading={loading}
                        badgeLabel="Nhập dữ liệu xe"
                        colorTheme="teal"
                        isLocalProcessing={true}
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-8 bg-teal-500 rounded-sm"></span>
                                Kết Quả Khách Tự Khai Thác
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file'; input.accept = '.xlsx, .xls';
                                    input.onchange = async (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if(file) { try { const data = await processExcelFile(file, true); handleAnalyze(data); } catch(err) { alert(err); } }
                                    };
                                    input.click();
                                }} className="flex-1 sm:flex-none px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm text-sm font-medium flex justify-center items-center gap-2 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Thêm File
                                </button>
                                <button onClick={clearSelfData} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 shadow-sm text-sm font-medium transition-colors">
                                    Xóa Dữ Liệu
                                </button>
                            </div>
                        </div>
                        <CustomerTable data={selfCustomerData} title="Chi Tiết Khách Xe Tự Khai Thác" colorTheme="teal" />
                    </div>
                )
            )}

            {activeTab === ViewState.TRANSIT_DETAILED && (
                transitData.length === 0 ? (
                    <SingleUploadSection 
                        title="Thống Kê Xe Trung Chuyển" 
                        onAnalyze={handleAnalyze} 
                        loading={loading}
                        badgeLabel="Nhập dữ liệu trung chuyển"
                        colorTheme="cyan"
                        isLocalProcessing={true}
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <span className="w-2 h-8 bg-cyan-500 rounded-sm"></span>
                                    Thống Kê Xe Trung Chuyển
                                </h2>
                                <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded-md font-medium">Đã lưu tự động</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file'; input.accept = '.xlsx, .xls';
                                    input.onchange = async (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if(file) { try { const data = await processExcelFile(file, true); handleAnalyze(data); } catch(err) { alert(err); } }
                                    };
                                    input.click();
                                }} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-sm text-sm font-medium flex items-center gap-2 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Thêm File
                                </button>
                                <button onClick={clearTransitData} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 shadow-sm text-sm font-medium transition-colors">
                                    Xóa Dữ Liệu
                                </button>
                            </div>
                        </div>
                        <TransitTable data={transitData} />
                    </div>
                )
            )}

            {activeTab === ViewState.CUSTOMER_PHONE && (
                phoneData.length === 0 ? (
                    <SingleUploadSection 
                        title="Tổng Hợp Khách Theo SĐT" 
                        onAnalyze={handleAnalyze} 
                        loading={loading}
                        badgeLabel="Phân tích khách hàng"
                        colorTheme="pink"
                        isLocalProcessing={true}
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-8 bg-pink-500 rounded-sm"></span>
                                Kết Quả Khách Hàng Thân Thiết
                            </h2>
                            <button onClick={() => setPhoneData([])} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium transition-colors">Tải file khác</button>
                        </div>
                        <PhoneTable data={phoneData} />
                    </div>
                )
            )}

            {activeTab === ViewState.REVENUE_VAT && (
                invoiceData.length === 0 ? (
                    <DualUploadSection 
                        onAnalyze={handleAnalyze}
                        loading={loading}
                        config={vatConfig}
                    />
                ) : (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-8 bg-indigo-500 rounded-sm"></span>
                                Kết Quả Đối Soát VAT
                            </h2>
                            <button onClick={() => setInvoiceData([])} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium transition-colors">Thực hiện đối soát mới</button>
                        </div>
                        <RevenueTable data={invoiceData} />
                    </div>
                )
            )}

          </Suspense>
          </ErrorBoundary>

        </div>
      </main>
    </div>
  );
};

export default App;