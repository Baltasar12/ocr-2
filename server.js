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
        console.error("Error: La API Key de Gemini no está configurada.");
        return res.status(500).json({ error: 'API Key no configurada en el servidor.' });
    }
    
    if (!req.file) {
        console.error("Error: No se recibió ningún archivo en la petición.");
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = req.body.prompt || `
            Analiza los datos de esta factura o remito. Extrae la siguiente información y devuélvela estrictamente en formato JSON.
            - Número de Factura/Comprobante
            - Fecha de la Factura (formato YYYY-MM-DD)
            - Nombre o Razón Social del emisor
            - CUIT del emisor
            - Importe Total
            - Percepciones de IVA e Ingresos Brutos (si están presentes)
            - Lista detallada de todos los ítems, con su cantidad, descripción, precio unitario e importe total.
            Si un campo opcional como una percepción no se encuentra, su valor debe ser null. Los campos obligatorios son 'invoiceNumber' y 'items'. Si no puedes encontrar alguno de estos, devuelve un error.
        `;

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype,
            },
        };

        console.log(`Enviando archivo ${req.file.originalname} a la API de Gemini...`);
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        console.log("Respuesta cruda de Gemini:", responseText); // <-- LOG IMPORTANTE

        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonData = JSON.parse(cleanedText);

        // --- NUEVA VALIDACIÓN EN EL BACKEND ---
        if (!jsonData || !jsonData.invoiceNumber || !Array.isArray(jsonData.items)) {
            console.error("Error: La respuesta de Gemini no tiene la estructura esperada.", jsonData);
            // Devolvemos un error 502 (Bad Gateway) que significa que recibimos una respuesta inválida de un servidor upstream (Gemini).
            return res.status(502).json({ 
                error: 'La IA devolvió una estructura de datos inválida o incompleta. Revisa los logs del servidor para ver la respuesta completa.' 
            });
        }

        console.log("Procesamiento con Gemini exitoso.");
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error procesando con la IA:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar con la IA.' });
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