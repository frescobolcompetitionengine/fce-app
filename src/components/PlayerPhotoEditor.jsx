import React, { useRef, useState } from 'react';
import { Camera, Upload, User, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { uploadImageFile } from '@/services/fileService';

export default function PlayerPhotoEditor({ photoUrl, onPhotoChange, label }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const { t } = useI18n();

  const handleFile = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      const { file_url } = await uploadImageFile(file);
      onPhotoChange(file_url);
    } catch (error) {
      console.error('Photo upload failed:', error);
      toast.error(t('photoProcessError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider">{label}</p>

      {/* Photo circle */}
      <div className="w-24 h-24 rounded-full border-4 border-[#0f9b8e] overflow-hidden bg-[#0d0d1a] flex items-center justify-center">
        {uploading ? (
          <div className="animate-spin w-6 h-6 border-4 border-[#0f9b8e] border-t-transparent rounded-full" />
        ) : photoUrl ? (
          <img src={photoUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800">
            <User className="w-12 h-12 text-gray-300" />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap justify-center">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-xs text-gray-300 transition-colors"
        >
          <Upload className="w-3 h-3" />
          {t('upload')}
        </button>
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-xs text-gray-300 transition-colors"
        >
          <Camera className="w-3 h-3" />
          {t('camera')}
        </button>
        {photoUrl && (
          <button
            onClick={() => onPhotoChange('')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-900/40 hover:bg-red-800/60 text-xs text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t('remove')}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

