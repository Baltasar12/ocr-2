// @ts-nocheck
declare var pdfjsLib: any;

export const sanitizePdf = async (file: File): Promise<File> => {
    console.log("Sanitizando PDF:", file.name);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error("No se pudo obtener el contexto del canvas.");

        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });

        if (!blob) throw new Error("Fallo al convertir el canvas a blob.");

        const sanitizedFile = new File([blob], `sanitized_${file.name.replace(/\.pdf$/i, '.jpg')}`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });

        console.log("Sanitización exitosa.");
        return sanitizedFile;
    } catch (error) {
        console.error(`Falló la sanitización del PDF '${file.name}'. Razón:`, error);
        return file;
    }
};