import { GoogleGenAI, Type } from "@google/genai";

// This schema must be kept in sync with the frontend's expectations and the prompt.
const invoiceSchema = {
    type: Type.OBJECT,
    properties: {
        invoiceNumber: { type: Type.STRING, description: "Número de Factura o Comprobante, ej: 0004-00123456" },
        invoiceDate: { type: Type.STRING, description: "Fecha de la factura en formato YYYY-MM-DD" },
        supplierName: { type: Type.STRING, description: "Nombre o Razón Social del emisor de la factura" },
        cuit: { type: Type.STRING, description: "C.U.I.T. del emisor, ej: 30-12345678-9" },
        totalAmount: { type: Type.NUMBER, description: "El importe total final de la factura" },
        ivaPerception: { type: Type.NUMBER, description: "Percepción de IVA si existe, sino null" },
        grossIncomePerception: { type: Type.NUMBER, description: "Percepción de Ingresos Brutos si existe, sino null" },
        otherTaxes: { type: Type.NUMBER, description: "Otros impuestos si existen, sino null" },
        items: {
            type: Type.ARRAY,
            description: "Lista de items o productos en la factura",
            items: {
                type: Type.OBJECT,
                properties: {
                    quantity: { type: Type.NUMBER, description: "Cantidad del item" },
                    description: { type: Type.STRING, description: "Descripción del producto o servicio" },
                    unitPrice: { type: Type.NUMBER, description: "Precio por unidad del item" },
                    total: { type: Type.NUMBER, description: "Importe total para este item (cantidad * precio unitario)" },
                },
                required: ["quantity", "description", "unitPrice", "total"]
            }
        }
    },
    required: ["invoiceNumber", "invoiceDate", "cuit", "supplierName", "totalAmount", "items"]
};

// Required for Vercel Edge Functions
export const config = {
  runtime: 'edge',
};

// Helper to encode ArrayBuffer to Base64 in an edge environment
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Default export for Vercel Serverless Function
export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key no configurada en el servidor' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const prompt = formData.get('prompt') as string;
    const sourceIsText = formData.get('sourceIsText') === 'true';
    const textContent = formData.get('textContent') as string | null;

    if (!file && !sourceIsText) {
      return new Response(JSON.stringify({ error: 'No se recibió ningún archivo o texto' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    let contents: any; // Type is GenerateContentParameters['contents']

    if (sourceIsText && textContent) {
      contents = { parts: [{ text: textContent }, { text: prompt }] };
    } else if (file) {
      const imagePart = {
        inlineData: {
          data: arrayBufferToBase64(await file.arrayBuffer()),
          mimeType: file.type,
        },
      };
      contents = { parts: [imagePart, { text: prompt }] };
    } else {
      return new Response(JSON.stringify({ error: 'Entrada inválida' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: invoiceSchema,
      },
    });

    let jsonString = response.text;
    
    // Safeguard to remove markdown code fences if the AI adds them
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace("```json", "").replace("```", "").trim();
    }

    return new Response(jsonString, { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in serverless function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor al procesar con la IA';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
