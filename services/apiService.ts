import { sanitizePdf } from './pdfUtils';

/**
 * Procesa un único archivo (imagen o PDF) llamando al backend.
 * Se encarga de la sanitización si es un PDF.
 */
export const processSingleFile = async (file: File) => {
    try {
        let fileToUpload = file;
        if (file.type === 'application/pdf') {
            fileToUpload = await sanitizePdf(file);
        }
        
        const formData = new FormData();
        formData.append('file', fileToUpload);

        const response = await fetch('/api/procesar-factura', { method: 'POST', body: formData });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Error del servidor (código ${response.status})` }));
            throw new Error(errorData.error);
        }
        
        const ocrData = await response.json();
        return { success: true, file, data: ocrData };

    } catch (error) {
        console.error(`Falló el procesamiento del archivo '${file.name}'. Razón:`, error);
        const reason = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, file, reason };
    }
};

/**
 * Procesa un array de archivos en lotes (chunks) para no saturar la API.
 */
export async function processInChunks<T, R>(items: T[], chunkSize: number, processor: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        console.log(`Procesando lote: ${i / chunkSize + 1} de ${Math.ceil(items.length / chunkSize)}`);
        
        const chunkPromises = chunk.map(processor);
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
    }
    return results;
}