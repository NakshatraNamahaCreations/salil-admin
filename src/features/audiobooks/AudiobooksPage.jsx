import React, { useState, useEffect } from 'react';
import { DataTable, Badge } from '../../components/ui/DataDisplay';
import { SearchInput, Select } from '../../components/ui/Forms';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Forms';
import { Headphones, Plus, Edit, Trash2, Play, Pause, Upload } from 'lucide-react';
import api from '../../services/api';
import { uploadFileToS3 } from '../../services/s3Upload';
import toast from 'react-hot-toast';

const formatDuration = (s) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`;
};

export const AudiobooksPage = () => {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bookFilter, setBookFilter] = useState('');
  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editTrack, setEditTrack] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showZipUpload, setShowZipUpload] = useState(false);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipResult, setZipResult] = useState(null);
  const [zipBookId, setZipBookId] = useState('');

  const fetchTracks = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (bookFilter) params.bookId = bookFilter;
      const res = await api.get('/admin/audiobooks', { params });
      setTracks(res.data || []);
      setPagination(res.pagination || null);
    } catch {
      setTracks([]);
    } finally { setLoading(false); }
  };

  const fetchBooks = async () => {
    try {
      const res = await api.get('/admin/books', { params: { limit: 100, contentType: 'audiobook' } });
      const list =
        res?.data?.books ||
        res?.books ||
        res?.data?.data ||
        res?.data ||
        [];
      const audioOnly = Array.isArray(list) ? list.filter(b => b.contentType === 'audiobook') : [];
      setBooks(audioOnly);
    } catch {
      setBooks([]);
    }
  };

  useEffect(() => { fetchBooks(); }, []);
  useEffect(() => { fetchTracks(); }, [page, bookFilter]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchTracks(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this audiobook track?')) return;
    try { await api.delete(`/admin/audiobooks/${id}`); toast.success('Track deleted'); fetchTracks(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleTogglePublish = async (id) => {
    try { await api.patch(`/admin/audiobooks/${id}/publish`); toast.success('Status updated'); fetchTracks(); }
    catch { toast.error('Failed to update status'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    setSubmitting(true);
    try {
      const payload = {
        bookId: formData.get('bookId'),
        title: formData.get('title'),
        narrator: formData.get('narrator') || '',
        duration: Number(formData.get('duration')) || 0,
        status: formData.get('status') || 'draft',
      };
      const audioFile = formData.get('audioFile');
      if (audioFile && audioFile instanceof File && audioFile.size > 0) {
        const tid = toast.loading('Uploading audio to S3...');
        payload.audioUrl = await uploadFileToS3(audioFile, 'audio');
        toast.dismiss(tid);
      } else {
        payload.audioUrl = formData.get('audioUrl') || '';
      }
      await api.post('/admin/audiobooks', payload);
      toast.success('Track created');
      setShowCreate(false);
      fetchTracks();
    } catch (err) { toast.error(err.message || 'Failed to create track'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    setSubmitting(true);
    try {
      const payload = {
        title: formData.get('title'),
        narrator: formData.get('narrator') || '',
        duration: Number(formData.get('duration')) || 0,
        status: formData.get('status'),
      };
      const audioFile = formData.get('audioFile');
      if (audioFile && audioFile instanceof File && audioFile.size > 0) {
        const tid = toast.loading('Uploading audio to S3...');
        payload.audioUrl = await uploadFileToS3(audioFile, 'audio');
        toast.dismiss(tid);
      } else {
        const audioUrl = formData.get('audioUrl');
        if (audioUrl) payload.audioUrl = audioUrl;
      }
      await api.put(`/admin/audiobooks/${editTrack._id}`, payload);
      toast.success('Track updated');
      setEditTrack(null);
      fetchTracks();
    } catch (err) { toast.error(err.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleZipUpload = async (e) => {
    e.preventDefault();
    const file = e.target.zipFile.files[0];
    if (!file) return toast.error('Please select a ZIP file');
    if (!zipBookId) return toast.error('Please select a book');
    const formData = new FormData();
    formData.append('zipFile', file);
    formData.append('bookId', zipBookId);
    setZipUploading(true);
    setZipResult(null);
    try {
      const res = await api.post('/admin/audiobooks/bulk-zip', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setZipResult(res.data || res);
      toast.success(`${(res.data || res).uploaded} track(s) uploaded`);
      fetchTracks();
    } catch (err) {
      toast.error(err.message || 'ZIP upload failed');
    } finally {
      setZipUploading(false);
    }
  };

  const bookLabel = (b) => b.bookLanguage ? `${b.title} (${b.bookLanguage})` : b.title;
  const bookOptions = [
    { value: '', label: 'All books' },
    ...books.map(b => ({ value: b._id, label: bookLabel(b) })),
  ];
  const bookSelectOptions = [
    { value: '', label: 'Select book' },
    ...books.map(b => ({ value: b._id, label: bookLabel(b) })),
  ];
  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'archived', label: 'Archived' },
  ];
  const columns = [
    {
      header: 'Track', key: 'title', align: 'left',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}>
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.title}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {row.narrator || 'No narrator'} · {formatDuration(row.duration)}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'Book', key: 'bookId', align: 'left',
      render: (row) => (
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.bookId?.title || '—'}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {row.bookId?.authorId?.displayName || row.bookId?.authorId?.name || ''}
          </p>
        </div>
      ),
    },
    { header: 'Language', key: 'bookLanguage', align: 'center', render: (row) => <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.bookId?.bookLanguage || '\u2014'}</span> },
    { header: 'Status', key: 'status', align: 'center', render: (row) => <Badge variant={row.status === 'published' ? 'success' : row.status === 'archived' ? 'danger' : 'neutral'}>{row.status}</Badge> },
    { header: 'Listens', key: 'listenCount', align: 'center', render: (row) => <span className="text-sm inline-block" style={{ color: 'var(--text-secondary)' }}>{(row.listenCount || 0).toLocaleString()}</span> },
    {
      header: '', key: 'actions', align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <Button
            variant="ghost" size="sm"
            icon={row.status === 'published' ? Pause : Play}
            title={row.status === 'published' ? 'Unpublish' : 'Publish'}
            className={row.status === 'published' ? '!text-green-500' : ''}
            onClick={() => handleTogglePublish(row._id)}
          />
          <Button variant="ghost" size="sm" icon={Edit} onClick={() => setEditTrack(row)} />
          <Button variant="ghost" size="sm" icon={Trash2} className="!text-red-400" onClick={() => handleDelete(row._id)} />
        </div>
      ),
    },
  ];

  const TrackForm = ({ defaultValues = {}, onSubmit, onCancel, submitLabel = 'Create Track', isEdit = false }) => (
    <form className="space-y-4" onSubmit={onSubmit}>
      {!isEdit && <Select label="Book" name="bookId" required options={bookSelectOptions} defaultValue={defaultValues.bookId?._id || defaultValues.bookId || ''} />}
      <Input label="Track Title" name="title" placeholder="Enter track title" required defaultValue={defaultValues.title || ''} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Upload Audio (MP3)" type="file" name="audioFile" accept="audio/*" />
        <Input label="Or enter Audio URL" name="audioUrl" placeholder="https://..." defaultValue={defaultValues.audioUrl || ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Narrator" name="narrator" placeholder="Narrator name" defaultValue={defaultValues.narrator || ''} />
        <Input label="Duration (seconds)" name="duration" type="number" placeholder="0" defaultValue={defaultValues.duration || 0} />
      </div>
      <Select label="Status" name="status" options={statusOptions} defaultValue={defaultValues.status || 'draft'} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" isLoading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="flex items-center gap-2.5">
            <Headphones className="w-5 h-5" style={{ color: '#6366f1' }} />
            Audiobooks
          </h1>
          <p>{pagination ? `${pagination.total} tracks` : 'Manage audiobook tracks'}</p>
        </div>
        <div className="page-actions">
          <SearchInput value={search} onChange={setSearch} placeholder="Search tracks..." className="w-52" />
          <Select value={bookFilter} onChange={e => { setBookFilter(e.target.value); setPage(1); }}
            options={bookOptions} className="!w-44" />
          <Button icon={Upload} variant="secondary" onClick={() => { setShowZipUpload(true); setZipResult(null); setZipBookId(''); }}>ZIP Upload</Button>
          <Button icon={Plus} onClick={() => setShowCreate(true)}>Add Track</Button>
        </div>
      </div>

      <DataTable columns={columns} data={tracks} isLoading={loading} pagination={pagination} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Audiobook Track" >
        <TrackForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} submitLabel="Create Track" />
      </Modal>

      {/* Edit Modal */}
      {editTrack && (
        <Modal isOpen={!!editTrack} onClose={() => setEditTrack(null)} title="Edit Audiobook Track" >
          <TrackForm
            defaultValues={editTrack}
            onSubmit={handleEdit}
            onCancel={() => setEditTrack(null)}
            submitLabel="Save Changes"
            isEdit
          />
        </Modal>
      )}

      {/* ZIP Upload Modal */}
      <Modal isOpen={showZipUpload} onClose={() => { setShowZipUpload(false); setZipResult(null); }} title="Bulk ZIP Upload — Audio Tracks">
        {!zipResult ? (
          <form className="space-y-4" onSubmit={handleZipUpload}>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Select Book</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                value={zipBookId}
                onChange={e => setZipBookId(e.target.value)}
                required
              >
                <option value="">Select audiobook...</option>
                {books.map(b => <option key={b._id} value={b._id}>{bookLabel(b)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ZIP File (MP3, M4A, WAV...)</label>
              <input type="file" name="zipFile" accept=".zip" className="w-full text-sm" style={{ color: 'var(--text-primary)' }} required />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Each audio file in the ZIP becomes a track. Filename = track title. Files are sorted naturally (1, 2, 10...).</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowZipUpload(false)} disabled={zipUploading}>Cancel</Button>
              <Button type="submit" icon={Upload} isLoading={zipUploading}>Upload ZIP</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="font-semibold" style={{ color: 'var(--success)' }}>{zipResult.uploaded} uploaded</span>
              {zipResult.failed > 0 && <span className="font-semibold" style={{ color: 'var(--danger)' }}>{zipResult.failed} failed</span>}
            </div>
            <div className="rounded-lg p-3 space-y-1 max-h-60 overflow-y-auto" style={{ background: 'var(--surface-2)' }}>
              {zipResult.tracks?.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span style={{ color: 'var(--success)' }}>✓</span>
                  <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                </div>
              ))}
              {zipResult.errors?.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span style={{ color: 'var(--danger)' }}>✗</span>
                  <span style={{ color: 'var(--text-muted)' }}>{e.file}: {e.error}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { setShowZipUpload(false); setZipResult(null); }}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
