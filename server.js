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

        // --- PROMPT MEJORADO ---
        // Le especificamos los nombres de campo exactos en inglés (camelCase)
        const prompt = req.body.prompt || `
            Analiza esta factura. Extrae la información y devuélvela en formato JSON usando EXACTAMENTE los siguientes nombres de campo:
            - invoiceNumber (string)
            - invoiceDate (string, formato YYYY-MM-DD)
            - supplierName (string)
            - cuit (string)
            - totalAmount (number)
            - ivaPerception (number o null)
            - grossIncomePerception (number o null)
            - items (array de objetos, cada uno con: quantity, description, unitPrice, total)
            
            Es crucial que los nombres de las claves en el JSON sean los especificados (ej. 'invoiceNumber', no 'numero_factura').
        `;

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype,
            },
        };

        console.log(`Enviando archivo ${req.file.originalname} a Gemini...`);
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        console.log("Respuesta cruda de Gemini:", responseText);

        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        let jsonData = JSON.parse(cleanedText);

        // --- LÓGICA DE NORMALIZACIÓN (NUEVO) ---
        // Esta función busca varios nombres posibles y los unifica a lo que el frontend espera.
        const normalizeData = (data) => {
            const normalized = { ...data };
            
            // Unificar número de factura
            const invoiceKey = Object.keys(normalized).find(k => k.toLowerCase().includes('factura') || k.toLowerCase().includes('comprobante'));
            if (invoiceKey && invoiceKey !== 'invoiceNumber') {
                normalized.invoiceNumber = normalized[invoiceKey];
                delete normalized[invoiceKey];
            }

            // Unificar CUIT y otros campos si es necesario (puedes expandir esto)
            const cuitKey = Object.keys(normalized).find(k => k.toLowerCase().includes('cuit'));
            if (cuitKey && cuitKey !== 'cuit') {
                normalized.cuit = normalized[cuitKey];
                delete normalized[cuitKey];
            }
            
            return normalized;
        };
        
        jsonData = normalizeData(jsonData);

        // --- VALIDACIÓN MEJORADA ---
        if (!jsonData || !jsonData.invoiceNumber || !Array.isArray(jsonData.items)) {
            console.error("Error: La estructura de datos sigue siendo inválida después de normalizar.", jsonData);
            return res.status(502).json({ 
                error: 'La IA devolvió datos inconsistentes. Revisa los logs para más detalles.' 
            });
        }

        console.log("Procesamiento exitoso.");
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error en el backend:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
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