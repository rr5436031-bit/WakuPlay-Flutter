import Icon from './Icon'

export default function ActionSheet({ title, items, onClose }) {
  return (
    <div className="as-bg" onClick={onClose}>
      <div className="as-sheet" onClick={(e) => e.stopPropagation()} role="menu">
        <div className="as-grip" />
        {title && <p className="as-title">{title}</p>}
        {items.filter(Boolean).map((it) => (
          <button key={it.label} className={`as-item ${it.danger ? 'danger' : ''}`} role="menuitem" onClick={() => { onClose(); it.onClick() }}>
            <Icon name={it.icon} size={22} />{it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
