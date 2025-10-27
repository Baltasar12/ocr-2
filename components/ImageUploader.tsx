
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
    <div className="flex flex-col items-center justify-center p-8 w-full h-full">
      <div
        className={`w-full max-w-2xl p-10 border-2 border-dashed rounded-lg text-center transition-colors
          ${isDragging ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && document.getElementById('file-input')?.click()}
      >
        <div className="flex flex-col items-center justify-center">
          <UploadIcon className="w-16 h-16 text-slate-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Arrastra y suelta tus facturas aquí</h2>
          <p className="text-slate-500 mb-4">o</p>
          <button
            type="button"
            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-300"
            disabled={disabled}
          >
            {disabled ? 'Inicializando...' : 'Buscar Archivos'}
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
        <p className="mt-6 text-sm text-slate-400">Formatos soportados: PNG, JPG, PDF</p>
      </div>
    </div>
  );
};

export default ImageUploader;
