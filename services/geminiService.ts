// @ts-nocheck
declare var pdfjsLib: any;

import type { InvoiceData } from '../types';

interface OcrLineItem {
  quantity: number;
  description: string;
  unitPrice: number;
  total: number;
}

// Type for raw data returned by Gemini
type GeminiInvoiceData = Omit<InvoiceData, 'items' | 'usePreloadedCatalog' | 'identifiedSupplierCuit'> & { items: OcrLineItem[] };

/**
 * "Sanitizes" a PDF by rendering its first page to a JPEG image.
 * This helps bypass potential upload issues with malformed PDFs.
 * @param file The original PDF file.
 * @returns A new File object representing the JPEG image.
 */
const sanitizePdf = async (file: File): Promise<File> => {
    console.log("Sanitizing PDF:", file.name);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1); // Get the first page

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error("Could not get canvas context.");
        }

        // Render at a high resolution for good OCR quality
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95); // High quality jpeg
        });

        if (!blob) {
            throw new Error("Failed to convert canvas to blob.");
        }

        const sanitizedFile = new File([blob], `sanitized_${file.name.replace(/\.pdf$/i, '.jpg')}`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });

        console.log("Sanitization successful, new file:", sanitizedFile.name);
        return sanitizedFile;

    } catch (error) {
        console.error("PDF sanitization failed, uploading original file as fallback.", error);
        // If sanitization fails (e.g., corrupted PDF), return the original file and let the backend try.
        return file;
    }
};

export const extractInvoiceData = async (source: File | string): Promise<GeminiInvoiceData> => {
    const basePrompt = `
        Analiza los datos de esta factura o remito. Extrae la siguiente información y devuélvela estrictamente en formato JSON según el schema proporcionado.
        - Número de Factura/Comprobante
        - Fecha de la Factura (formato YYYY-MM-DD)
        - Nombre o Razón Social del emisor
        - CUIT del emisor
        - Importe Total
        - Percepciones de IVA e Ingresos Brutos (si están presentes)
        - Lista detallada de todos los ítems, con su cantidad, descripción, precio unitario e importe total.
        Si un campo opcional como una percepción no se encuentra, su valor debe ser null.
    `;

    const formData = new FormData();
    formData.append('prompt', basePrompt);

    if (typeof source === 'string') {
        formData.append('sourceIsText', 'true');
        formData.append('textContent', source);
    } else {
        let fileToUpload = source;
        if (source.type === 'application/pdf') {
            fileToUpload = await sanitizePdf(source);
        }
        formData.append('file', fileToUpload);
    }

    try {
        const response = await fetch('/api/procesar-factura', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response from server.' }));
            throw new Error(errorData.error || 'Respuesta no exitosa del servidor.');
        }

        const parsedData = await response.json();
        
        if (!parsedData || !parsedData.invoiceNumber || !Array.isArray(parsedData.items)) {
            throw new Error("La IA devolvió una estructura de datos inválida o incompleta.");
        }

        return parsedData as GeminiInvoiceData;

    } catch (error) {
        console.error("Error calling backend proxy:", error);
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`No se pudo procesar el documento. Razón: ${message}`);
    }
};
