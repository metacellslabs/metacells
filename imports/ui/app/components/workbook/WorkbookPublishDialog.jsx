import { useEffect, useRef, useState } from 'react';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function WorkbookPublishDialog({
  isOpen,
  initialTitle,
  initialImages,
  submitting,
  onClose,
  onSubmit,
}) {
  const fileInputRef = useRef(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, submitting]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(String(initialTitle || '').trim());
    setDescription('');
    setTagsText('');
    setImages(Array.isArray(initialImages) ? initialImages : []);
  }, [initialImages, initialTitle, isOpen]);

  if (!isOpen) return null;

  const handlePickImages = async (event) => {
    const files = Array.from((event.target && event.target.files) || []);
    if (!files.length) return;
    try {
      const nextImages = await Promise.all(
        files.map(async (file) => ({
          name: String(file.name || 'image'),
          type: String(file.type || 'application/octet-stream'),
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setImages((current) => current.concat(nextImages));
    } catch (error) {
      window.alert(error.message || 'Failed to load selected image');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      title: String(title || '').trim(),
      description: String(description || '').trim(),
      tags: String(tagsText || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      images,
    });
  };

  return (
    <div
      className="app-dialog-overlay"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        className="app-dialog-modal workbook-publish-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="app-dialog-header">
          <h2 className="app-dialog-title">Publish to Hub</h2>
          <p className="app-dialog-description">
            Submit this workbook to the hub with a description, tags, and optional cover images.
          </p>
        </div>

        <div className="app-dialog-body">
          <label className="workbook-publish-field">
            <span>Title</span>
            <input
              className="app-dialog-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Workbook title"
              minLength={3}
              required
            />
          </label>

          <label className="workbook-publish-field">
            <span>Description</span>
            <textarea
              className="app-dialog-input workbook-publish-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this workbook does, who it is for, and what the hub reviewer should know."
              minLength={20}
              required
            />
          </label>

          <label className="workbook-publish-field">
            <span>Tags</span>
            <input
              className="app-dialog-input"
              type="text"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="finance, reporting, automation"
            />
          </label>

          <div className="workbook-publish-field">
            <span>Images</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickImages}
            />
            {images.length ? (
              <div className="workbook-publish-image-list">
                {images.map((image, index) => (
                  <div key={`${image.name}-${index}`} className="workbook-publish-image-item">
                    <span>{image.name}</span>
                    <button
                      type="button"
                      className="workbook-publish-remove"
                      onClick={() =>
                        setImages((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="app-dialog-actions">
          <button
            type="button"
            className="app-dialog-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="app-dialog-button app-dialog-button-primary"
            disabled={submitting}
          >
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}
