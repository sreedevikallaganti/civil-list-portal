"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import pb from "@/lib/pocketbase";
import { compressImage } from "@/lib/memories/compressImage";
import { photoUrl, type MemoryMeeting } from "@/lib/memories/meetingUtils";
import PhotoLightbox from "@/components/memories/PhotoLightbox";
import MemoryStyles from "@/components/memories/MemoryStyles";

const MAX_PHOTOS = 10;
const MISSING_FIELD_MSG =
  'Photos can’t be saved yet — the "meetings" collection needs a File field named "photos" (ask the PocketBase admin).';
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

type Props<T extends MemoryMeeting> = {
  meeting: T;
  /** Called with the saved record after photos are added or removed. */
  onChange?: (updated: T) => void;
  /** Hide the add/delete controls (view only). */
  readOnly?: boolean;
};

/**
 * Photo gallery + uploader for one meeting.
 * Drop it into the meeting details panel:
 *   <MeetingPhotos meeting={meeting} onChange={onMeetingChange} />
 */
export default function MeetingPhotos<T extends MemoryMeeting>({ meeting, onChange, readOnly }: Props<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<T>(meeting);
  const [uploading, setUploading] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // follow the parent if it passes a newer version of the meeting
  const [lastProp, setLastProp] = useState(meeting);
  if (meeting !== lastProp) {
    setLastProp(meeting);
    setCurrent(meeting);
  }

  const photos = current.photos ?? [];
  const room = MAX_PHOTOS - photos.length;
  /* PocketBase only returns fields that exist — no `photos` key means the field hasn't been added yet */
  const fieldMissing = !("photos" in current);

  function saved(rec: T) {
    setCurrent(rec);
    onChange?.(rec);
  }

  async function addFiles(list: FileList | File[]) {
    setError("");
    const files = Array.from(list).filter((f) => ACCEPT.includes(f.type));
    if (files.length < list.length) setError("Only JPG, PNG and WebP photos are supported.");
    if (!files.length) return;
    if (room <= 0) return setError(`A meeting can have up to ${MAX_PHOTOS} photos.`);

    const chosen = files.slice(0, room);
    if (files.length > room) setError(`Only ${room} more photo(s) can be added (limit ${MAX_PHOTOS}).`);

    setUploading(chosen.length);
    try {
      const compressed = await Promise.all(chosen.map((f) => compressImage(f)));
      const data = new FormData();
      compressed.forEach((f) => data.append("photos+", f)); // "+" = append to existing photos
      const rec = await pb.collection("meetings").update<T>(current.id, data);
      if (!("photos" in rec)) throw new Error(MISSING_FIELD_MSG);
      saved(rec);
    } catch (err) {
      console.error("[MeetingPhotos] upload failed", err);
      const msg = err instanceof Error && err.message === MISSING_FIELD_MSG ? MISSING_FIELD_MSG
        : (err as { response?: { message?: string } })?.response?.message || "Upload failed. Please try again.";
      setError(msg);
    } finally {
      setUploading(0);
    }
  }

  /* two-tap delete: first tap arms the button, second tap (within 3 s) deletes */
  const [armed, setArmed] = useState<string | null>(null);
  async function removePhoto(name: string) {
    if (armed !== name) {
      setArmed(name);
      setTimeout(() => setArmed((a) => (a === name ? null : a)), 3000);
      return;
    }
    setArmed(null);
    setRemoving(name);
    setError("");
    try {
      saved(await pb.collection("meetings").update<T>(current.id, { "photos-": [name] }));
    } catch (err) {
      console.error("[MeetingPhotos] delete failed", err);
      setError("Couldn't delete the photo.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="mem-root">
      <MemoryStyles />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50">
            <Camera className="h-4 w-4 text-violet-600" />
          </span>
          <h3 className="text-sm font-bold text-slate-900">Photos</h3>
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-violet-700">
            {photos.length}
          </span>
        </div>
        {!readOnly && photos.length > 0 && room > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((name, i) => (
            <li
              key={name}
              className="mem-fade-up group relative aspect-square overflow-hidden rounded-2xl bg-slate-100"
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <button type="button" onClick={() => setViewer(i)} aria-label={`Open photo ${i + 1}`} className="h-full w-full cursor-zoom-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(current, name, "400x400")}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removePhoto(name)}
                  aria-label={armed === name ? "Tap again to delete" : "Delete photo"}
                  title={armed === name ? "Tap again to delete" : "Delete photo"}
                  disabled={removing === name}
                  className={`absolute right-1.5 top-1.5 flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full text-white transition ${
                    armed === name
                      ? "bg-rose-600 px-2.5 opacity-100"
                      : "w-7 bg-slate-900/70 opacity-100 hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100"
                  }`}
                >
                  {removing === name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {armed === name && <span className="text-[10px] font-bold">Delete?</span>}
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <li key={`up-${i}`} className="mem-skeleton flex aspect-square items-center justify-center rounded-2xl">
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            </li>
          ))}
        </ul>
      )}

      {fieldMissing && !readOnly && (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">{MISSING_FIELD_MSG}</p>
      )}

      {!fieldMissing && !readOnly && photos.length === 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!uploading) addFiles(e.dataTransfer.files); }}
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-7 text-center transition-all duration-200 ${
            dragging ? "border-violet-400 bg-violet-50" : "border-violet-200 bg-violet-50/40 hover:border-violet-300 hover:bg-violet-50/70"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> : <ImagePlus className="h-5 w-5 text-violet-500" />}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {uploading ? `Uploading ${uploading} photo(s)…` : "Add meeting photos"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Tap or drop up to {MAX_PHOTOS} photos · resized automatically</p>
        </div>
      )}

      {readOnly && photos.length === 0 && <p className="mt-2 text-xs text-slate-400">No photos for this meeting.</p>}

      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <PhotoLightbox
        images={photos.map((n) => ({ src: photoUrl(current, n, "1200x0") }))}
        index={viewer}
        onIndexChange={setViewer}
      />
    </section>
  );
}
