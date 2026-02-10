// Components and props appearing multiple times (for alias generation)
const Page = () => (
  <div>
    <Button onClick={handleAdd}>Add</Button>
    <Button onClick={handleRemove} disabled>Remove</Button>
    <Button onClick={handleSave}>Save</Button>
    <Modal isOpen={show} onClose={handleClose}>
      <Input placeholder="Name" onChange={handleNameChange} />
      <Input placeholder="Email" onChange={handleEmailChange} />
    </Modal>
    <Modal isOpen={showConfirm} onClose={handleDismiss}>
      <p>Are you sure?</p>
    </Modal>
  </div>
);
