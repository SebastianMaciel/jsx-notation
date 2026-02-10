// The complete example from SPEC.md
const Example = () => (
  <Modal isOpen={showModal} onClose={handleClose}>
    <div className="modal-body">
      <h2>{title}</h2>
      {error && <Alert type="error">{error}</Alert>}
      <ul className="item-list">
        {items.map(item => (
          <li key={item.id} className="item" onClick={() => select(item)}>
            {item.name}
          </li>
        ))}
      </ul>
      <Button disabled={!selected} onClick={handleSubmit}>Confirmar</Button>
    </div>
  </Modal>
);
