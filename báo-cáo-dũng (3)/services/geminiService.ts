
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Define the schema for structured output
const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    driverStats: {
      type: Type.ARRAY,
      description: "Bảng công lái xe và số lượt xe chạy.",
      items: {
        type: Type.OBJECT,
        properties: {
          driverName: { type: Type.STRING, description: "Tên lái xe" },
          tripCount: { type: Type.NUMBER, description: "Số lượt xe chạy" },
          totalDistance: { type: Type.STRING, description: "Tổng quãng đường", nullable: true },
          notes: { type: Type.STRING, description: "Ghi chú", nullable: true },
        },
        required: ["driverName", "tripCount"],
      },
    },
    dailyCustomerStats: {
      type: Type.ARRAY,
      description: "Dữ liệu Khách Lái Xe Hàng Ngày.",
      items: {
        type: Type.OBJECT,
        properties: {
          driverName: { type: Type.STRING },
          date: { type: Type.STRING, description: "Ngày tháng (DD/MM/YYYY)", nullable: true },
          customerCount: { type: Type.NUMBER, description: "Tổng số khách" },
          tripCount: { type: Type.NUMBER, description: "Tổng số chuyến xe (dựa trên dữ liệu dòng hoặc mã chuyến)", nullable: true },
          customerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
          notes: { type: Type.STRING, nullable: true },
        },
        required: ["driverName", "customerCount", "customerNames"],
      },
    },
    selfCustomerStats: {
      type: Type.ARRAY,
      description: "Dữ liệu Khách Xe Tự Khai Thác (nếu có).",
      items: {
        type: Type.OBJECT,
        properties: {
          driverName: { type: Type.STRING },
          customerCount: { type: Type.NUMBER },
          customerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
          notes: { type: Type.STRING, nullable: true },
        },
        required: ["driverName", "customerCount", "customerNames"],
      },
    },
    invoiceStats: {
      type: Type.ARRAY,
      description: "Giữ lại schema để tránh lỗi, trả về mảng rỗng.",
      items: {
        type: Type.OBJECT,
        properties: {
          ticketCode: { type: Type.STRING },
          realAmount: { type: Type.NUMBER },
          invoiceAmount: { type: Type.NUMBER },
          isVatIssued: { type: Type.BOOLEAN },
          notes: { type: Type.STRING, nullable: true },
        },
      },
    },
    summary: {
      type: Type.STRING,
      description: "Tóm tắt kết quả.",
    },
  },
  // We make arrays optional in 'required' to allow partial filling
  required: ["driverStats", "summary"],
};

export const analyzeReport = async (csvData: string[], userPrompt: string): Promise<AnalysisResult> => {
  const model = "gemini-2.5-flash";

  const prompt = `
    Bạn là trợ lý AI phân tích dữ liệu vận tải.
    Dưới đây là dữ liệu CSV từ file Excel:
    
    ${csvData.map((csv, index) => `--- DATA FILE ${index + 1} ---\n${csv}\n--- END DATA ---`).join('\n\n')}
    
    YÊU CẦU CỤ THỂ: "${userPrompt}"
    
    HƯỚNG DẪN XỬ LÝ:
    1. **Nếu yêu cầu là "Bảng Công"**: Đếm lượt chạy cho từng lái xe vào 'driverStats'.
    2. **Nếu yêu cầu là "Khách Hàng Ngày"**: 
       - Trích xuất dữ liệu vào 'dailyCustomerStats'. 
       - Cố gắng tìm cột Ngày Tháng để điền vào trường 'date' (Định dạng DD/MM/YYYY). Nếu file có nhiều ngày, hãy tách thành các dòng riêng biệt cho từng ngày của từng lái xe.
       - 'customerCount': Đếm tổng số lượng khách hàng.
       - 'tripCount': Đếm số lượng chuyến đi của lái xe đó trong ngày đó.
       - Bỏ qua 'selfCustomerStats'.
    3. **Nếu yêu cầu là "Khách Tự Khai Thác"**: Trích xuất dữ liệu vào 'selfCustomerStats'. Bỏ qua 'dailyCustomerStats'.
    4. Tên lái xe phải viết hoa chữ cái đầu (Title Case).
    5. Trả về JSON theo đúng Schema. Nếu mảng nào không có dữ liệu, hãy trả về mảng rỗng [].
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Không nhận được phản hồi từ AI.");
    }

    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Lỗi khi gọi Google Gemini API: " + (error instanceof Error ? error.message : String(error)));
  }
};
