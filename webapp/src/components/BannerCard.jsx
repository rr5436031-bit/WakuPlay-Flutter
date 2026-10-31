import Icon from './Icon'

export default function BannerCard({ title, body, button, buttonText, onButton, onClose, preview }) {
  return (
    <div className="bn-card">
      <div className="bn-head">
        <Icon name="bell" size={28} />
        <h3>{title || '…'}</h3>
        {onClose && <button className="bn-x" onClick={onClose} aria-label="Tutup"><Icon name="close" size={26} /></button>}
      </div>
      <p className="bn-body">{body || '…'}</p>
      {button && <button className="bn-btn" onClick={preview ? undefined : onButton} type="button">{buttonText || 'Tombol'}</button>}
    </div>
  )
}
