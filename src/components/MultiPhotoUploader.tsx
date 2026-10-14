import React, { useRef, useState } from 'react';
import { Upload, X, CheckCircle2, Camera, Loader2, Cloud } from 'lucide-react';
import { compressImage } from '../services/imageCompressor';
import { uploadPhotoToGoogleDrive } from '../services/googleSheetsHelper';
import { SafeImage } from './SafeImage';
import { showAppAlert } from '../utils/dialogService';
import { PhotoCacheService } from '../services/photoCache';

interface MultiPhotoUploaderProps {
  photos: string[]; // Array of strings (up to 4 slots)
  onChange: (photos: string[]) => void;
  scriptUrl?: string; // Optional Google Apps Script URL for direct Drive upload
  minPhotos?: number;
  maxPhotos?: number;
}

const MultiPhotoUploaderComponent: React.FC<MultiPhotoUploaderProps> = ({
  photos = [],
  onChange,
  scriptUrl,
  maxPhotos = 4
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSlotIndexRef = useRef<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<Record<number, boolean>>({});
  // Local cache for base64 thumbnails to guarantee instant and unbreakable previews
  const [localPreviews, setLocalPreviews] = useState<Record<number, string>>({});

  // Normalize photos into 4 fixed slots [slot0, slot1, slot2, slot3]
  const slots = [
    photos[0] || '',
    photos[1] || '',
    photos[2] || '',
    photos[3] || ''
  ];

  const slotConfigs = [
    {
      label: 'Foto 1: Bukti Pekerjaan',
      required: true,
      subtitle: 'Wajib (Foto saat pengerjaan / hasil kerja)'
    },
    {
      label: 'Foto 2: Bukti Titik / Lokasi',
      required: true,
      subtitle: 'Wajib (Foto titik perangkat / maps lokasi)'
    },
    {
      label: 'Foto 3: Bukti Tambahan 1',
      required: false,
      subtitle: 'Opsional (Dokumentasi pendukung)'
    },
    {
      label: 'Foto 4: Bukti Tambahan 2',
      required: false,
      subtitle: 'Opsional (Dokumentasi pendukung)'
    }
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetIdx = activeSlotIndexRef.current ?? 0;
    setIsCompressing(true);

    try {
      // 1. Compress image strictly under 200KB for fast UI & lightweight storage
      const compressedBase64 = await compressImage(file, 0.2, 1000);
      
      // Keep in local cache for immediate unbreakable preview
      setLocalPreviews(prev => ({ ...prev, [targetIdx]: compressedBase64 }));
      PhotoCacheService.set(compressedBase64, compressedBase64);

      const newSlots = [...slots];
      newSlots[targetIdx] = compressedBase64;
      onChange(newSlots.slice(0, maxPhotos));

      // 2. If Google Apps Script URL is available, upload directly to Google Drive
      if (scriptUrl && scriptUrl.trim().length > 0) {
        setUploadingSlots(prev => ({ ...prev, [targetIdx]: true }));
        try {
          const res = await uploadPhotoToGoogleDrive(
            scriptUrl,
            compressedBase64,
            `foto_${targetIdx + 1}_${Date.now()}.jpg`
          );
          if (res.success && res.url) {
            const driveSlots = [...newSlots];
            driveSlots[targetIdx] = res.url;
            onChange(driveSlots.slice(0, maxPhotos));
          }
        } catch (uploadErr) {
          console.warn('Drive upload error, keeping compressed local photo:', uploadErr);
        } finally {
          setUploadingSlots(prev => ({ ...prev, [targetIdx]: false }));
        }
      }
    } catch (err: any) {
      showAppAlert({
        title: 'Gagal Memproses Foto',
        message: `Format foto tidak didukung atau terjadi kesalahan: ${err.message || 'Gagal memproses file'}`,
        type: 'error'
      });
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTriggerUpload = (index: number) => {
    activeSlotIndexRef.current = index;
    fileInputRef.current?.click();
  };

  const handleRemovePhoto = (index: number) => {
    setLocalPreviews(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const newSlots = [...slots];
    newSlots[index] = '';
    onChange(newSlots);
    setUploadingSlots(prev => ({ ...prev, [index]: false }));
  };

  const hasPhoto1 = Boolean((localPreviews[0] || slots[0])?.trim().length > 0);
  const hasPhoto2 = Boolean((localPreviews[1] || slots[1])?.trim().length > 0);
  const isRequiredPhotosComplete = hasPhoto1 && hasPhoto2;
  const totalUploaded = slots.filter((p, i) => Boolean(localPreviews[i] || (p && p.trim().length > 0))).length;

  return (
    <div className="space-y-2">
      {/* Header Info */}
      <div className="flex items-center justify-between text-xs">
        <label className="font-bold text-slate-800 flex items-center space-x-1.5">
          <Camera className="w-4 h-4 text-indigo-600" />
          <span>Upload Foto Pekerjaan</span>
          {isCompressing && (
            <span className="flex items-center space-x-1 text-indigo-600 font-semibold animate-pulse text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Mengompres foto (~100-200KB)...</span>
            </span>
          )}
        </label>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isRequiredPhotosComplete
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-amber-100 text-amber-800 border-amber-200'
          }`}
        >
          {totalUploaded}/4 Foto ({isRequiredPhotosComplete ? 'Wajib Terpenuhi' : 'Wajib 2 Foto'})
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Grid Slots */}
      <div className="grid grid-cols-2 gap-2.5">
        {slotConfigs.slice(0, maxPhotos).map((slotInfo, idx) => {
          const photoUrl = localPreviews[idx] || slots[idx];
          const isUploaded = Boolean(photoUrl && photoUrl.trim().length > 0);
          const isSlotUploading = Boolean(uploadingSlots[idx]);
          const isDriveUrl = Boolean(
            slots[idx] && (slots[idx].startsWith('http://') || slots[idx].startsWith('https://'))
          );

          return (
            <div
              key={idx}
              className={`relative rounded-xl border p-2 transition-all flex flex-col justify-between h-36 ${
                isUploaded
                  ? 'border-indigo-300 bg-indigo-50/40 shadow-xs'
                  : slotInfo.required
                  ? 'border-dashed border-rose-300 bg-rose-50/25 hover:bg-rose-50/50'
                  : 'border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <div className="flex items-start justify-between z-10">
                <div className="flex items-center space-x-1">
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                      slotInfo.required
                        ? isUploaded
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {slotInfo.required ? 'WAJIB *' : 'OPSIONAL'}
                  </span>

                  {isSlotUploading ? (
                    <span className="text-[8px] font-extrabold px-1 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center space-x-0.5">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Drive...</span>
                    </span>
                  ) : isDriveUrl ? (
                    <span className="text-[8px] font-extrabold px-1 py-0.5 rounded bg-blue-100 text-blue-800 flex items-center space-x-0.5" title="Tersimpan di Google Drive">
                      <Cloud className="w-2.5 h-2.5" />
                      <span>Drive</span>
                    </span>
                  ) : null}
                </div>

                {isUploaded && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(idx)}
                    className="p-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-md transition-transform hover:scale-110"
                    title="Hapus foto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Slot Thumbnail or Upload Trigger */}
              {isUploaded ? (
                <div
                  onClick={() => handleTriggerUpload(idx)}
                  className="relative flex-1 my-1 rounded-lg overflow-hidden cursor-pointer group border border-indigo-200 bg-white"
                >
                  <SafeImage
                    src={photoUrl}
                    alt={slotInfo.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    fallbackText={slotInfo.label}
                    showOpenLink={false}
                  />
                  {isSlotUploading && (
                    <div className="absolute inset-0 bg-indigo-950/60 flex flex-col items-center justify-center text-white text-[9px] font-bold p-1 text-center space-y-1">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
                      <span>Upload Google Drive...</span>
                    </div>
                  )}
                  {!isSlotUploading && (
                    <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold p-1 text-center">
                      <Camera className="w-4 h-4 mb-0.5" />
                      <span>Ganti Foto</span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleTriggerUpload(idx)}
                  className={`flex-1 my-1 flex flex-col items-center justify-center space-y-1 rounded-lg transition-colors p-1.5 text-center ${
                    slotInfo.required
                      ? 'text-rose-600 hover:text-rose-700 bg-rose-50/50 hover:bg-rose-100/50'
                      : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100/60'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-[10px] font-bold">
                    {slotInfo.required ? '+ Upload Wajib' : '+ Upload Foto'}
                  </span>
                </button>
              )}

              {/* Footer Title */}
              <div className="text-[10px] pt-1 border-t border-slate-200/60">
                <p className="font-bold text-slate-800 truncate leading-tight flex items-center justify-between">
                  <span>{slotInfo.label}</span>
                  {isUploaded && <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 ml-1" />}
                </p>
                <p className="text-[9px] text-slate-500 truncate">
                  {slotInfo.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MultiPhotoUploader = React.memo(MultiPhotoUploaderComponent, (prevProps, nextProps) => {
  if (prevProps.scriptUrl !== nextProps.scriptUrl) return false;
  if (prevProps.maxPhotos !== nextProps.maxPhotos) return false;
  if (prevProps.minPhotos !== nextProps.minPhotos) return false;
  const prevP = prevProps.photos || [];
  const nextP = nextProps.photos || [];
  if (prevP.length !== nextP.length) return false;
  for (let i = 0; i < prevP.length; i++) {
    if (prevP[i] !== nextP[i]) return false;
  }
  return true;
});
