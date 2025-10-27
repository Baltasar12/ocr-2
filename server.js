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

        // Prompt mejorado para guiar a la IA
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

        // --- FUNCIÓN DE NORMALIZACIÓN COMPLETA ---
        const normalizeData = (data) => {
            const normalized = {};

            // Mapeo de claves flexibles (de español/variado a camelCase en inglés)
            const keyMap = {
                invoiceNumber: ['invoiceNumber', 'numero_factura', 'numero_comprobante', 'Número de Factura/Comprobante'],
                invoiceDate: ['invoiceDate', 'fecha_factura', 'Fecha de la Factura'],
                supplierName: ['supplierName', 'emisor_nombre', 'nombre_emisor', 'emisor_nombre_razon_social', 'Nombre o Razón Social del emisor'],
                cuit: ['cuit', 'emisor_cuit', 'cuit_emisor', 'CUIT del emisor'],
                totalAmount: ['totalAmount', 'importe_total', 'Importe Total'],
                ivaPerception: ['ivaPerception', 'percepcion_iva', 'percepciones_iva', 'Percepciones de IVA'],
                grossIncomePerception: ['grossIncomePerception', 'percepcion_ingresos_brutos', 'percepciones_ingresos_brutos', 'Percepciones de Ingresos Brutos'],
                items: ['items']
            };
            
            // "Traduce" las claves del nivel principal
            for (const [targetKey, possibleKeys] of Object.entries(keyMap)) {
                for (const possibleKey of possibleKeys) {
                    if (data[possibleKey] !== undefined) {
                        normalized[targetKey] = data[possibleKey];
                        break;
                    }
                }
            }

            // "Traduce" las claves dentro de cada objeto en el array 'items'
            if (Array.isArray(normalized.items)) {
                normalized.items = normalized.items.map(item => ({
                    quantity: item.cantidad || item.quantity,
                    description: item.descripcion || item.description,
                    unitPrice: item.precio_unitario || item.unitPrice,
                    total: item.importe_total || item.importe_total_item || item.total
                }));
            }

            return normalized;
        };
        
        jsonData = normalizeData(jsonData);

        // Validación final con los datos ya normalizados
        if (!jsonData || !jsonData.invoiceNumber || !Array.isArray(jsonData.items)) {
            console.error("Error: Estructura inválida después de normalizar.", jsonData);
            return res.status(502).json({ 
                error: 'La IA devolvió datos inconsistentes. Revisa los logs.' 
            });
        }

        console.log("Procesamiento exitoso. Datos normalizados enviados al frontend:", jsonData);
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