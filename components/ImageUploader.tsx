
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  onFilesUpload: (files: File[]) => void;
  disabled: boolean;
}

const UPLOAD_LIMIT = 50;

const ImageUploader: React.FC<ImageUploaderProps> = ({ onFilesUpload, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (disabled || !files || files.length === 0) return;

    let filesToProcess = Array.from(files);

    if (filesToProcess.length > UPLOAD_LIMIT) {
      alert(`Puedes subir un máximo de ${UPLOAD_LIMIT} archivos a la vez. Se procesarán los primeros ${UPLOAD_LIMIT} documentos.`);
      filesToProcess = filesToProcess.slice(0, UPLOAD_LIMIT);
    }

    const acceptedFiles = filesToProcess.filter(
      file => file.type.startsWith('image/') || file.type === 'application/pdf'
    );

    if (acceptedFiles.length > 0) {
      onFilesUpload(acceptedFiles);
    } else {
      alert('Por favor, sube archivos de imagen (JPEG, PNG) o PDF válidos.');
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [onFilesUpload, disabled]);

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full h-full text-center">
        <UploadIcon className="w-20 h-20 text-violet-300 mb-6" />
        <h2 className="text-3xl font-bold text-slate-800 mb-3">Carga de Facturas</h2>
        <p className="text-slate-500 mb-8 max-w-xl">
            Sube tus facturas en formato de imagen (PNG, JPG) o PDF. Puedes seleccionar múltiples archivos a la vez.
            La IA se encargará de analizarlos y extraer la información relevante.
        </p>
      <div
        className={`w-full max-w-2xl p-10 border-2 border-dashed rounded-2xl transition-all duration-300
          ${isDragging ? 'border-violet-600 bg-violet-50 scale-105 shadow-xl' : 'border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-white'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && document.getElementById('file-input')?.click()}
      >
        <div className="flex flex-col items-center justify-center">
          <p className="font-semibold text-slate-700 mb-2">Arrastra y suelta tus archivos aquí</p>
          <p className="text-slate-500 mb-4">o</p>
          <button
            type="button"
            className="px-6 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:bg-violet-400 disabled:shadow-none disabled:transform-none"
            disabled={disabled}
          >
            {disabled ? 'Inicializando...' : 'Seleccionar Archivos'}
          </button>
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept="image/png, image/jpeg, application/pdf"
            multiple
            onChange={(e) => handleFileChange(e.target.files)}
            disabled={disabled}
          />
        </div>
      </div>
        <p className="mt-6 text-xs text-slate-400">
            Puedes subir hasta {UPLOAD_LIMIT} archivos a la vez. Formatos soportados: PNG, JPG, PDF.
        </p>
    </div>
  );
};

export default ImageUploader;
