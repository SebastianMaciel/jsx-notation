// Map expressions
const List = () => (
  <ul className="item-list">
    {items.map(item => (
      <li key={item.id} className="item" onClick={() => select(item)}>
        {item.name}
      </li>
    ))}
  </ul>
);
