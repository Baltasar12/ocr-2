
import React, { useCallback, useState } from 'react';
import { DatabaseIcon } from './icons';
import type { MasterDatabase, MasterProduct } from '../types';

interface MasterUploaderProps {
  onLoad: (data: MasterDatabase) => void;
}

const MasterUploader: React.FC<MasterUploaderProps> = ({ onLoad }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCSV = (csvText: string): MasterDatabase => {
    const rows = csvText.split(/\r?\n/).filter(row => row.trim() !== '');
    if (rows.length < 2) throw new Error("El CSV está vacío o solo tiene una fila de encabezado.");

    const header = rows[0].split(',').map(h => h.trim());
    // CUIT,RAZON_SOCIAL,CODIGO_PROVEEDOR,CODIGO_PRODUCTO,NOMBRE_PRODUCTO
    const requiredHeaders = ["CUIT", "RAZON_SOCIAL", "CODIGO_PROVEEDOR", "CODIGO_PRODUCTO", "NOMBRE_PRODUCTO"];
    if (!requiredHeaders.every(h => header.includes(h))) {
        throw new Error(`El encabezado del CSV no tiene las columnas requeridas. Se esperaba: ${requiredHeaders.join(', ')}`);
    }

    const data = rows.slice(1).map(row => {
        const values = row.split(',');
        const entry: {[key: string]: string} = {};
        header.forEach((h, i) => entry[h] = values[i]?.trim());
        return entry;
    });

    const db: MasterDatabase = new Map();

    data.forEach(d => {
        const cuit = d.CUIT;
        if (!cuit) return;

        if (!db.has(cuit)) {
            db.set(cuit, {
                supplierCode: d.CODIGO_PROVEEDOR,
                supplierName: d.RAZON_SOCIAL,
                products: [],
            });
        }
        
        db.get(cuit)!.products.push({
            productCode: d.CODIGO_PRODUCTO,
            productName: d.NOMBRE_PRODUCTO,
        });
    });

    if (db.size === 0) {
        throw new Error("No se pudieron analizar datos válidos del CSV. Revisa la columna CUIT y el formato de los datos.");
    }
    
    return db;
  };

  const handleFile = (file: File) => {
    setError(null);
    if (file && file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsedData = parseCSV(content);
          onLoad(parsedData);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo analizar el archivo CSV.");
        }
      };
      reader.onerror = () => {
        setError("No se pudo leer el archivo.");
      }
      reader.readAsText(file);
    } else {
      setError('Por favor, sube un archivo CSV válido.');
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
        e.dataTransfer.clearData();
    }
  }, [onLoad]);

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full h-full text-center">
        <DatabaseIcon className="w-20 h-20 text-violet-300 mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 mb-3">Base de Datos Maestra</h2>
        <p className="text-slate-500 mb-8 max-w-xl">
            Para comenzar, necesitamos que cargues la base de datos maestra de productos en formato CSV.
            Este archivo es esencial para que la IA pueda identificar y asociar correctamente los productos en las facturas.
        </p>
      <div
        className={`w-full max-w-2xl p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
          ${isDragging ? 'border-violet-600 bg-violet-50 scale-105 shadow-xl' : 'border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-white'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => document.getElementById('master-file-input')?.click()}
      >
        <div className="flex flex-col items-center justify-center">
          <p className="font-semibold text-slate-700 mb-2">Arrastra y suelta el archivo CSV aquí</p>
          <p className="text-slate-500 mb-4">o</p>
          <button
            type="button"
            className="px-6 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Seleccionar Archivo
          </button>
          <input
            id="master-file-input"
            type="file"
            className="hidden"
            accept=".csv, text/csv"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          />
        </div>
      </div>
       {error && <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm w-full max-w-2xl">{error}</div>}
        <p className="mt-6 text-xs text-slate-400 max-w-2xl">
            Asegúrate de que el archivo CSV contenga las siguientes columnas: CUIT, RAZON_SOCIAL, CODIGO_PROVEEDOR, CODIGO_PRODUCTO, NOMBRE_PRODUCTO
        </p>
    </div>
  );
};

export default MasterUploader;
