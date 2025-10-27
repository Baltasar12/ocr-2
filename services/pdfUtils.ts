
// @ts-nocheck
declare var pdfjsLib: any;

// This function checks the first page to see if it contains a significant amount of text.
export const isPdfTextBased = async (file: File): Promise<boolean> => {
    const fileReader = new FileReader();
    return new Promise((resolve) => {
        fileReader.onload = async (event) => {
            try {
                const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                const page = await pdf.getPage(1);
                const content = await page.getTextContent();
                // Threshold: if there are more than 20 text fragments, it's native.
                resolve(content.items.length > 20); 
            } catch (e) {
                // If it fails to read, we assume it's an image-based PDF.
                resolve(false);
            }
        };
        fileReader.onerror = () => resolve(false);
        fileReader.readAsArrayBuffer(file);
    });
};

// This function extracts all text from a native PDF.
export const extractTextFromPdf = async (file: File): Promise<string> => {
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
            try {
                const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += content.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(fullText);
            } catch (e) {
                reject(new Error("No se pudo extraer el texto del PDF."));
            }
        };
        fileReader.onerror = () => reject(new Error("Error al leer el archivo PDF."));
        fileReader.readAsArrayBuffer(file);
    });
}
