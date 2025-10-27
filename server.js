// /server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';

// --- Configuración Inicial ---
const app = express();
const port = process.env.PORT || 3001; // Render usa la variable de entorno PORT para desplegar

// Configuración para poder usar __dirname en los módulos ES6 de Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares (ayudantes) ---
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Permite al servidor entender JSON

// Configuración de Multer para manejar la subida de archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Ruta de la API para Procesar Facturas ---
// Esta es la lógica de tu antiguo archivo /api/procesar-factura.ts, ahora en Express
app.post('/api/procesar-factura', upload.single('file'), async (req, res) => {
    console.log("Recibida petición para procesar factura...");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Error: La API Key de Gemini no está configurada.");
        return res.status(500).json({ error: 'API Key no configurada en el servidor.' });
    }
    
    // El middleware 'upload.single('file')' pone el archivo en req.file
    if (!req.file) {
        console.error("Error: No se recibió ningún archivo en la petición.");
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Usamos un modelo más reciente y robusto, como gemini-1.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = req.body.prompt || `
            Analiza los datos de esta factura o remito. Extrae la siguiente información y devuélvela estrictamente en formato JSON.
            - Número de Factura/Comprobante
            - Fecha de la Factura (formato YYYY-MM-DD)
            - Nombre o Razón Social del emisor
            - CUIT del emisor
            - Importe Total
            - Percepciones de IVA e Ingresos Brutos (si están presentes)
            - Lista detallada de todos los ítems, con su cantidad, descripción, precio unitario e importe total.
            Si un campo opcional como una percepción no se encuentra, su valor debe ser null.
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
        
        // Limpiamos la respuesta por si Gemini devuelve ```json markdown
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonData = JSON.parse(cleanedText);

        console.log("Procesamiento con Gemini exitoso.");
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error procesando con la IA:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar con la IA.' });
    }
});


// --- Servir la Aplicación de React ---
// 1. Le decimos a Express que todos los archivos en la carpeta 'dist' son públicos
app.use(express.static(path.join(__dirname, 'dist')));

// 2. Para cualquier otra petición que no sea a la API, devolvemos el index.html
// Esto permite que React Router (si lo tuvieras) maneje las rutas del frontend.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Iniciar el Servidor ---
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});