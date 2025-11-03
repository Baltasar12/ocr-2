// /server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { fetchWithRetry, repairJson, normalizeData } from './server-utils.js'; // <-- IMPORTAMOS

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
    if (!apiKey) return res.status(500).json({ error: 'API Key no configurada.' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = req.body.prompt || `
            Analiza esta factura. Extrae la información y devuélvela en formato JSON usando EXACTAMENTE los siguientes nombres de campo en camelCase:
            - invoiceNumber, invoiceDate (formato YYYY-MM-DD), supplierName, cuit, totalAmount, ivaPerception, grossIncomePerception
            - items (array de objetos, cada uno con: quantity, description, unitPrice, total)
        `;
        const imagePart = { inlineData: { data: req.file.buffer.toString("base64"), mimeType: req.file.mimetype } };

        console.log(`Enviando archivo ${req.file.originalname} a Gemini...`);

        const result = await fetchWithRetry(() => model.generateContent([prompt, imagePart]));
        const responseText = result.response.text();
        
        console.log("Respuesta cruda de Gemini:", responseText);
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const repairedText = repairJson(cleanedText);
        let jsonData = JSON.parse(repairedText);
        
        jsonData = normalizeData(jsonData);

        if (jsonData.invoiceNumber === undefined || jsonData.items === undefined) {
            console.error("Error: Estructura inválida después de normalizar.", jsonData);
            return res.status(502).json({ error: 'La IA devolvió datos inconsistentes.' });
        }

        console.log("Procesamiento exitoso. Datos normalizados:", jsonData);
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error en el backend:', error.message);
        if (error.status === 503) {
            return res.status(503).json({ error: 'El servicio de IA está sobrecargado. Intenta de nuevo.' });
        }
        if (error instanceof SyntaxError) {
             return res.status(500).json({ error: `La IA devolvió un JSON inválido. Error: ${error.message}` });
        }
        res.status(500).json({ error: `Error interno del servidor.` });
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