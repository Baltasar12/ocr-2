
import React, { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';

// @ts-nocheck
declare var pdfjsLib: any;

interface InvoiceDisplayProps {
  file: File | null;
}

const InvoiceDisplay: React.FC<InvoiceDisplayProps> = ({ file }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let currentObjectUrl: string | null = null;

    const renderFile = async () => {
      // The canvas is now always mounted, so we can set loading without the ref becoming null.
      setIsLoading(true);
      setError(null);
      
      if (!file) {
        setIsLoading(false);
        return;
      }

      try {
        if (file.type.startsWith('image/')) {
          currentObjectUrl = URL.createObjectURL(file);
          setObjectUrl(currentObjectUrl);
        } else if (file.type === 'application/pdf') {
          // Clear any previous image URL to avoid showing stale content
          setObjectUrl(null); 
          
          const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('No se pudo leer el archivo PDF.'));
            reader.readAsArrayBuffer(file);
          });

          const typedarray = new Uint8Array(arrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          const page = await pdf.getPage(1);
          
          const canvas = canvasRef.current;
          const container = containerRef.current;

          // This check remains a safeguard, but the race condition that caused it is solved.
          if (!canvas || !container) {
            throw new Error("No se encontró el elemento canvas o contenedor. No se puede renderizar el PDF.");
          }
          
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error("No se pudo obtener el contexto 2D del canvas.");
          }

          if (container.clientWidth === 0) {
             throw new Error("El contenedor de la vista previa no tiene ancho, no se puede calcular la escala del PDF.");
          }
          
          const viewport = page.getViewport({ scale: 1.0 });
          const scale = container.clientWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          canvas.height = scaledViewport.height;
          canvas.width = scaledViewport.width;

          await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        } else {
          throw new Error(`Tipo de archivo no soportado: ${file.type}`);
        }
      } catch (e) {
        console.error("Error rendering file preview:", e);
        setError(e instanceof Error ? e.message : 'No se pudo previsualizar el PDF.');
      } finally {
        setIsLoading(false);
      }
    };

    renderFile();

    return () => {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };
  }, [file]);

  // Base style to hide content during loading/error states, allowing overlays to be seen.
  const contentStyle: React.CSSProperties = {
    visibility: isLoading || error ? 'hidden' : 'visible',
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg flex flex-col h-full">
      <h2 className="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Vista Previa del Documento</h2>
      <div ref={containerRef} className="relative flex-grow overflow-auto rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center p-2">
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-10">
            <Spinner />
            <p className="mt-2 text-slate-500">Cargando vista previa...</p>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 bg-red-50 flex items-center justify-center z-10 p-4">
             <div className="text-center text-red-600">
                <p className="font-semibold text-lg">Error en la Vista Previa</p>
                <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Always-mounted content: visibility and display are toggled via styles */}
        <img 
            src={objectUrl || ''} 
            alt="Invoice preview" 
            className="max-w-full max-h-full object-contain"
            style={{
                ...contentStyle,
                display: file?.type.startsWith('image/') ? 'block' : 'none'
            }}
        />
        <canvas 
            ref={canvasRef} 
            style={{ 
                ...contentStyle,
                width: '100%', 
                height: 'auto',
                display: file?.type === 'application/pdf' ? 'block' : 'none'
            }} 
        />
        
        {/* Placeholder for when no file is selected */}
        {!file && !isLoading && !error && (
            <div className="text-center text-slate-500 p-8">
                <p className="font-semibold text-lg">Ningún documento seleccionado</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceDisplay;
