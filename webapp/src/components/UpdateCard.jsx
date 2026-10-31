import Icon from './Icon'
import { fmtVer } from '../lib/version'

export default function UpdateCard({ version, current, message, onDownload, onClose, preview }) {
  return (
    <div className="up-card">
      <div className="up-head">
        <Icon name="download" size={26} />
        <div className="up-title"><h3>Update tersedia</h3><span>{version ? `Versi ${fmtVer(version)}` : 'Versi …'}{current ? ` · kamu memakai ${fmtVer(current)}` : ''}</span></div>
        {onClose && <button className="bn-x" onClick={onClose} aria-label="Tutup"><Icon name="close" size={26} /></button>}
      </div>
      <div className="up-line" />
      <p className="up-msg">{message || '…'}</p>
      <div className="up-line" />
      <button className="up-btn" type="button" onClick={preview ? undefined : onDownload}><Icon name="download" size={22} /> Download</button>
    </div>
  )
}
