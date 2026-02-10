// Conditionals, ternaries, fragments
const Cmp = () => (
  <div>
    {isLoading && <Spinner />}
    {error && <Alert type="error">{error}</Alert>}
    {isLoggedIn ? <Dashboard /> : <Login />}
  </div>
);
