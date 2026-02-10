// Basic elements with classes, ids, text, expressions, props
const App = () => (
  <div className="container">
    <h1 id="title">Hello World</h1>
    <p className="intro description">Welcome to JSXN</p>
    <span>{message}</span>
    <input type="email" placeholder="Enter email" />
    <img src={logoUrl} alt="Logo" />
  </div>
);
