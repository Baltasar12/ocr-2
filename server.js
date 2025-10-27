// /server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';

// --- Configuración Inicial ---
const app = express();
const port = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares ---
app.use(cors());
app.use(express.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Helper para Reintentos ---
const fetchWithRetry = async (fn, retries = 3, delay = 2000) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Reintentar solo en errores 503 (sobrecarga)
      if (error.status === 503) {
        console.log(`Intento ${i + 1} falló por sobrecarga. Reintentando en ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        // Si es otro error, fallar inmediatamente
        throw error;
      }
    }
  }
  throw lastError;
};

// --- Ruta de la API para Procesar Facturas ---
app.post('/api/procesar-factura', upload.single('file'), async (req, res) => {
    console.log("Recibida petición para procesar factura...");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API Key no configurada.' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = req.body.prompt || `
            Analiza esta factura. Extrae la información y devuélvela en formato JSON usando EXACTAMENTE los siguientes nombres de campo:
            - invoiceNumber (string), invoiceDate (string, formato YYYY-MM-DD), supplierName (string), cuit (string),
            - totalAmount (number), ivaPerception (number o null), grossIncomePerception (number o null)
            - items (array de objetos, cada uno con: quantity, description, unitPrice, total)
        `;
        const imagePart = { inlineData: { data: req.file.buffer.toString("base64"), mimeType: req.file.mimetype } };

        console.log(`Enviando archivo ${req.file.originalname} a Gemini...`);

        // Usamos la función con reintentos
        const result = await fetchWithRetry(() => model.generateContent([prompt, imagePart]));
        const responseText = result.response.text();
        
        console.log("Respuesta cruda de Gemini:", responseText);
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let jsonData = JSON.parse(cleanedText);

        const normalizeData = (data) => {
            const normalized = {};
            // Función para encontrar una clave sin importar mayúsculas/minúsculas
            const findKey = (obj, keys) => {
                const lowerCaseKeys = keys.map(k => k.toLowerCase());
                for (const key in obj) {
                    if (lowerCaseKeys.includes(key.toLowerCase())) {
                        return obj[key];
                    }
                }
                return undefined;
            };

            normalized.invoiceNumber = findKey(data, ['invoiceNumber', 'numero_factura', 'numero_comprobante']);
            normalized.invoiceDate = findKey(data, ['invoiceDate', 'fecha_factura']);
            normalized.supplierName = findKey(data, ['supplierName', 'emisor_nombre', 'nombre_emisor']);
            normalized.cuit = findKey(data, ['cuit', 'emisor_cuit', 'cuit_emisor']);
            normalized.totalAmount = findKey(data, ['totalAmount', 'importe_total']);
            normalized.ivaPerception = findKey(data, ['ivaPerception', 'percepcion_iva', 'percepciones_iva']);
            normalized.grossIncomePerception = findKey(data, ['grossIncomePerception', 'percepcion_ingresos_brutos', 'percepciones_ingresos_brutos']);
            
            const itemsArray = findKey(data, ['items']);
            if (Array.isArray(itemsArray)) {
                normalized.items = itemsArray.map(item => ({
                    quantity: findKey(item, ['quantity', 'cantidad']),
                    description: findKey(item, ['description', 'descripcion']),
                    unitPrice: findKey(item, ['unitPrice', 'precio_unitario']),
                    total: findKey(item, ['total', 'importe_total', 'importe_total_item', 'importe_total_linea'])
                }));
            }

            return normalized;
        };
        
        jsonData = normalizeData(jsonData);

        if (!jsonData || !jsonData.invoiceNumber || !Array.isArray(jsonData.items)) {
            console.error("Error: Estructura inválida después de normalizar.", jsonData);
            return res.status(502).json({ error: 'La IA devolvió datos inconsistentes.' });
        }

        console.log("Procesamiento exitoso. Datos normalizados:", jsonData);
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error en el backend:', error.message);
        res.status(500).json({ error: `Error interno del servidor: ${error.message}` });
    }
});

// --- Servir la Aplicación de React ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Iniciar el Servidor ---
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});